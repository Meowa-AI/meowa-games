import * as THREE from 'three';
import { CONFIG } from '../config';
import { loadPixelTexture } from '../core/AssetLoader';
import {
  DIR_VECTORS, toScreenDirection, type Direction,
} from '../input/Input';
import type { CollisionMap } from '../map/CollisionMap';
import type { MapData, MapNpc } from '../map/MapData';
import { makeCutoutMaterials } from '../map/PropsBuilder';
import { SpriteAnimator } from '../player/SpriteAnimator';

const WALK_SECONDS_PER_TILE = 0.32;
const CARDINAL_DIRECTIONS: Direction[] = ['down', 'left', 'up', 'right'];

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 1;
}

class NpcActor {
  readonly mesh: THREE.Mesh;
  private readonly animator?: SpriteAnimator;
  private readonly idleTexture?: THREE.Texture;
  private tileX: number;
  private tileY: number;
  private facing: Direction;
  private fromX: number;
  private fromY: number;
  private toX: number;
  private toY: number;
  private progress = 0;
  private moving = false;
  private talking = false;
  private stepsRemaining = 0;
  private pauseRemaining: number;
  private randomState: number;
  private visible = false;
  private orbitAngle: number;
  private animationProgress = 0;
  private idleElapsed = 0;
  private idleFrame = -1;
  private scriptedSteps?: Direction[];
  private scriptedResolve?: () => void;
  private scriptedReject?: (reason: Error) => void;

  private constructor(
    private readonly data: MapNpc,
    private readonly texture: THREE.Texture,
    private readonly collision: CollisionMap,
    idleTexture?: THREE.Texture,
  ) {
    this.idleTexture = idleTexture;
    const layout = data.spriteLayout ?? 'walk9';
    if (layout !== 'static') this.animator = new SpriteAnimator(texture);
    this.tileX = this.fromX = this.toX = data.x;
    this.tileY = this.fromY = this.toY = data.y;
    this.facing = data.facing;
    this.randomState = hashSeed(data.id);
    this.pauseRemaining = data.wander ? this.randomBetween(0.5, 1.8) : Infinity;
    this.orbitAngle = data.orbit?.startAngle ?? 0;

    const image = texture.image as { width: number; height: number };
    if (layout === 'walk9' && (image.width !== 144 || image.height !== 32)) {
      throw new Error(`NPC ${data.id} 行走表必须为 144x32，实际为 ${image.width}x${image.height}`);
    }
    if (layout === 'walk9Wide' && (image.width !== 288 || image.height !== 32)) {
      throw new Error(`NPC ${data.id} 宽帧行走表必须为 288x32，实际为 ${image.width}x${image.height}`);
    }
    // 原版 NPC 与玩家共用 9x1、16x32 帧契约和相同世界尺寸。
    const [width, height] = data.spriteWorldSize
      ?? [CONFIG.player.spriteWidth, CONFIG.player.spriteHeight];
    const { material, depthMaterial } = makeCutoutMaterials(texture);
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    this.mesh.customDepthMaterial = depthMaterial;
    this.mesh.castShadow = true;
    this.mesh.name = `npc-${data.id}`;
    this.animator?.showIdle(data.facing);
    this.mesh.visible = false;
    this.syncMesh();
  }

  static async create(data: MapNpc, collision: CollisionMap): Promise<NpcActor> {
    const [source, idleSource] = await Promise.all([
      loadPixelTexture(data.texture),
      data.idleAnimation ? loadPixelTexture(data.idleAnimation.texture) : undefined,
    ]);
    // 每个角色独立控制 UV，不能修改 AssetLoader 的共享纹理状态。
    const texture = source.clone();
    texture.needsUpdate = true;
    const idleTexture = idleSource?.clone();
    if (idleTexture) idleTexture.needsUpdate = true;
    return new NpcActor(data, texture, collision, idleTexture);
  }

  update(dt: number, cameraYaw: number, playerX: number, playerY: number): void {
    if (!this.visible) return;
    if (this.data.orbit) {
      const previousProgress = this.animationProgress;
      this.orbitAngle = (this.orbitAngle
        + dt * Math.PI * 2 / this.data.orbit.periodSeconds) % (Math.PI * 2);
      this.animationProgress = (this.animationProgress + dt * 4.5) % 1;
      if (this.animationProgress < previousProgress) this.animator?.onStepComplete();
      const tangentX = -Math.sin(this.orbitAngle) * this.data.orbit.radiusX;
      const tangentY = Math.cos(this.orbitAngle) * this.data.orbit.radiusY;
      this.facing = Math.abs(tangentX) > Math.abs(tangentY)
        ? (tangentX > 0 ? 'right' : 'left')
        : (tangentY > 0 ? 'down' : 'up');
    } else if (this.moving) {
      this.progress = Math.min(1, this.progress + dt / WALK_SECONDS_PER_TILE);
      if (this.progress >= 1) this.finishStep(playerX, playerY);
    } else if (this.data.wander && !this.talking) {
      this.pauseRemaining -= dt;
      if (this.pauseRemaining <= 0) this.startWalkingBout(playerX, playerY);
    }

    const screenFacing = toScreenDirection(this.facing, cameraYaw);
    if (this.data.orbit) {
      this.showBaseTexture();
      this.animator?.showWalk(screenFacing, this.animationProgress);
    } else if (this.moving) {
      this.showBaseTexture();
      this.animator?.showWalk(screenFacing, this.progress);
    } else if (!this.showIdleAnimation(dt, screenFacing)) {
      this.showBaseTexture();
      this.animator?.showIdle(screenFacing);
    }
    this.syncMesh();
    this.mesh.rotation.y = cameraYaw;
  }

  /** 只有完整停在目标格时才能被交互。 */
  isAt(x: number, y: number): boolean {
    return !this.data.orbit && this.visible && !this.moving
      && this.tileX === x && this.tileY === y;
  }

  setStoryVisible(visible: boolean): void {
    if (visible === this.visible) return;
    if (this.data.blocksMovement !== false) {
      if (visible) {
        this.collision.addBlocker(this.tileX, this.tileY);
      } else {
        // 行走中同时占据起点和终点；剧情隐藏角色时必须一起释放，
        // 否则画面里人已消失，目的格却会留下永久的隐形碰撞。
        this.collision.removeBlocker(this.tileX, this.tileY);
        if (this.moving) this.collision.removeBlocker(this.toX, this.toY);
      }
    }
    if (!visible && this.moving) {
      this.moving = false;
      this.progress = 0;
      const reject = this.scriptedReject;
      this.scriptedSteps = undefined;
      this.scriptedResolve = undefined;
      this.scriptedReject = undefined;
      reject?.(new Error(`NPC ${this.data.id} 在剧情行走途中被隐藏`));
    }
    this.visible = visible;
    this.mesh.visible = visible;
  }

  beginDialogue(playerX: number, playerY: number): void {
    this.talking = true;
    const dx = playerX - this.tileX;
    const dy = playerY - this.tileY;
    this.facing = Math.abs(dx) > Math.abs(dy)
      ? (dx > 0 ? 'right' : 'left')
      : (dy > 0 ? 'down' : 'up');
  }

  endDialogue(): void {
    this.talking = false;
    if (this.data.wander) this.pauseRemaining = this.randomPause();
  }

  walkScripted(steps: Direction[]): Promise<void> {
    if (this.data.orbit || this.moving || this.scriptedSteps) {
      return Promise.reject(new Error(`NPC ${this.data.id} 正在移动，不能开始剧情路径`));
    }
    if (steps.length === 0) return Promise.resolve();
    this.scriptedSteps = [...steps];
    return new Promise((resolve, reject) => {
      this.scriptedResolve = resolve;
      this.scriptedReject = reject;
      this.startNextScriptedStep();
    });
  }

  face(direction: Direction): void {
    if (!this.moving) this.facing = direction;
  }

  get dialogue(): string[] {
    return this.data.dialogue;
  }

  get name(): string {
    return this.data.name;
  }

  get id(): string {
    return this.data.id;
  }

  get interactionId(): string | undefined {
    return this.data.interactionId;
  }

  isVisibleDuring(phase: string): boolean {
    return !this.data.visibleDuring || this.data.visibleDuring.includes(phase);
  }

  private startWalkingBout(playerX: number, playerY: number): void {
    const wander = this.data.wander!;
    this.stepsRemaining = 1 + Math.floor(this.random() * wander.maxWalkSteps);
    const offset = Math.floor(this.random() * CARDINAL_DIRECTIONS.length);
    for (let i = 0; i < CARDINAL_DIRECTIONS.length; i++) {
      const direction = CARDINAL_DIRECTIONS[(offset + i) % CARDINAL_DIRECTIONS.length];
      if (this.tryStartStep(direction, playerX, playerY)) return;
    }
    this.pauseRemaining = this.randomPause();
  }

  private tryStartStep(direction: Direction, playerX: number, playerY: number): boolean {
    const { dx, dy } = DIR_VECTORS[direction];
    const nx = this.tileX + dx;
    const ny = this.tileY + dy;
    const [minX, minY, maxX, maxY] = this.data.wander!.bounds;
    if (nx < minX || nx > maxX || ny < minY || ny > maxY) return false;
    if (this.collision.isBlocked(nx, ny)) return false;
    // 玩家在移动中时也为其周围留出余量，避免双方同时抢同一格。
    if (Math.hypot(nx - playerX, ny - playerY) < 1.1) return false;

    this.facing = direction;
    this.fromX = this.tileX;
    this.fromY = this.tileY;
    this.toX = nx;
    this.toY = ny;
    this.progress = 0;
    this.moving = true;
    // 移动期间同时占用起点与终点；抵达后再释放起点。
    this.collision.addBlocker(nx, ny);
    return true;
  }

  private finishStep(playerX: number, playerY: number): void {
    const oldX = this.tileX;
    const oldY = this.tileY;
    this.tileX = this.toX;
    this.tileY = this.toY;
    this.collision.removeBlocker(oldX, oldY);
    this.moving = false;
    this.progress = 0;
    this.animator?.onStepComplete();
    if (this.scriptedSteps) {
      if (this.scriptedSteps.length > 0) {
        this.startNextScriptedStep();
        return;
      }
      this.scriptedSteps = undefined;
      const resolve = this.scriptedResolve;
      this.scriptedResolve = undefined;
      this.scriptedReject = undefined;
      resolve?.();
      return;
    }
    this.stepsRemaining--;

    if (this.stepsRemaining > 0 && this.tryStartStep(this.facing, playerX, playerY)) return;
    this.pauseRemaining = this.randomPause();
  }

  private startNextScriptedStep(): void {
    const direction = this.scriptedSteps?.shift();
    if (!direction) return;
    const { dx, dy } = DIR_VECTORS[direction];
    const nx = this.tileX + dx;
    const ny = this.tileY + dy;
    if (this.collision.isBlocked(nx, ny)) {
      const reject = this.scriptedReject;
      this.scriptedSteps = undefined;
      this.scriptedResolve = undefined;
      this.scriptedReject = undefined;
      reject?.(new Error(`NPC ${this.data.id} 剧情路径被阻挡: (${nx}, ${ny})`));
      return;
    }
    this.facing = direction;
    this.fromX = this.tileX;
    this.fromY = this.tileY;
    this.toX = nx;
    this.toY = ny;
    this.progress = 0;
    this.moving = true;
    this.collision.addBlocker(nx, ny);
  }

  private syncMesh(): void {
    const x = this.data.orbit
      ? this.data.x + Math.cos(this.orbitAngle) * this.data.orbit.radiusX
      : this.moving
        ? THREE.MathUtils.lerp(this.fromX, this.toX, this.progress)
        : this.tileX;
    const y = this.data.orbit
      ? this.data.y + Math.sin(this.orbitAngle) * this.data.orbit.radiusY
      : this.moving
        ? THREE.MathUtils.lerp(this.fromY, this.toY, this.progress)
        : this.tileY;
    const height = (this.mesh.geometry as THREE.PlaneGeometry).parameters.height;
    this.mesh.position.set(x + 0.5, height / 2 + CONFIG.player.yOffset, y + 1);
  }

  private showIdleAnimation(dt: number, facing: Direction): boolean {
    const animation = this.data.idleAnimation;
    if (!animation || !this.idleTexture || facing !== animation.facing) {
      this.idleElapsed = 0;
      this.idleFrame = -1;
      return false;
    }

    this.idleElapsed += dt;
    const frame = Math.floor(this.idleElapsed * animation.fps) % animation.frames;
    if (frame !== this.idleFrame) {
      const column = frame % animation.columns;
      const row = Math.floor(frame / animation.columns);
      this.idleTexture.repeat.set(1 / animation.columns, 1 / animation.rows);
      this.idleTexture.offset.set(
        column / animation.columns,
        (animation.rows - row - 1) / animation.rows,
      );
      this.idleFrame = frame;
    }
    this.setMeshTexture(this.idleTexture);
    return true;
  }

  private showBaseTexture(): void {
    this.setMeshTexture(this.texture);
  }

  private setMeshTexture(texture: THREE.Texture): void {
    const material = this.mesh.material as THREE.MeshLambertMaterial;
    if (material.map === texture) return;
    material.map = texture;
    material.needsUpdate = true;
    const depthMaterial = this.mesh.customDepthMaterial as THREE.MeshDepthMaterial;
    depthMaterial.map = texture;
    depthMaterial.needsUpdate = true;
  }

  private randomPause(): number {
    const [min, max] = this.data.wander!.pauseSeconds;
    return this.randomBetween(min, max);
  }

  private randomBetween(min: number, max: number): number {
    return min + (max - min) * this.random();
  }

  private random(): number {
    let x = this.randomState;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.randomState = x >>> 0;
    return this.randomState / 0x100000000;
  }
}

/** 创建未白镇 NPC；固定角色占一格，漫游角色会预留行走目的格。 */
export async function buildNpcs(
  map: MapData,
  collision: CollisionMap,
  getPhase: () => string = () => '',
): Promise<{
  group: THREE.Group;
  update: (dt: number, yaw: number, playerX: number, playerY: number) => void;
  refresh: () => void;
  interactAt: (
    x: number, y: number, playerX: number, playerY: number,
  ) => { speaker: string; pages: string[]; interactionId?: string } | undefined;
  endInteraction: () => void;
  walkActor: (id: string, steps: Direction[]) => Promise<void>;
  faceActor: (id: string, direction: Direction) => void;
}> {
  for (const npc of map.npcs) {
    if (npc.blocksMovement !== false && collision.isBlocked(npc.x, npc.y)) {
      throw new Error(`NPC ${npc.id} 站位不可用: (${npc.x}, ${npc.y})`);
    }
  }

  const actors = await Promise.all(map.npcs.map((npc) => NpcActor.create(npc, collision)));
  const group = new THREE.Group();
  group.name = 'npcs';
  // Object3D.add() 不接受零参数；无 NPC 的室内地图应保留空组。
  if (actors.length > 0) group.add(...actors.map((actor) => actor.mesh));
  let talkingActor: NpcActor | undefined;
  const refresh = () => {
    const phase = getPhase();
    for (const actor of actors) actor.setStoryVisible(actor.isVisibleDuring(phase));
  };
  refresh();

  return {
    group,
    refresh,
    update: (dt, yaw, playerX, playerY) => {
      for (const actor of actors) actor.update(dt, yaw, playerX, playerY);
    },
    interactAt: (x, y, playerX, playerY) => {
      const actor = actors.find((candidate) => candidate.isAt(x, y));
      if (!actor || actor.dialogue.length === 0) return undefined;
      talkingActor?.endDialogue();
      talkingActor = actor;
      actor.beginDialogue(playerX, playerY);
      return {
        speaker: actor.name,
        pages: actor.dialogue,
        interactionId: actor.interactionId,
      };
    },
    endInteraction: () => {
      talkingActor?.endDialogue();
      talkingActor = undefined;
    },
    walkActor: (id, steps) => {
      const actor = actors.find((candidate) => candidate.id === id);
      if (!actor) return Promise.reject(new Error(`找不到 NPC: ${id}`));
      return actor.walkScripted(steps);
    },
    faceActor: (id, direction) => {
      const actor = actors.find((candidate) => candidate.id === id);
      if (!actor) throw new Error(`找不到 NPC: ${id}`);
      actor.face(direction);
    },
  };
}
