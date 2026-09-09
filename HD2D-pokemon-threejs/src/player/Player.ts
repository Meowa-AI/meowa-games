import * as THREE from 'three';
import { CONFIG } from '../config';
import { loadPixelTexture } from '../core/AssetLoader';
import { makeCutoutMaterials } from '../map/PropsBuilder';
import type { CollisionMap } from '../map/CollisionMap';
import { toScreenDirection, type Direction, type Input } from '../input/Input';
import type { MapData } from '../map/MapData';
import { GridMovement } from './GridMovement';
import { SpriteAnimator } from './SpriteAnimator';

/**
 * 主角：直立精灵面片 + 网格移动 + 行走动画。
 */
export class Player {
  readonly mesh: THREE.Mesh;
  readonly movement: GridMovement;
  private readonly animator: SpriteAnimator;

  private constructor(tex: THREE.Texture, input: Input, collision: CollisionMap, map: MapData) {
    this.animator = new SpriteAnimator(tex);
    this.movement = new GridMovement(input, collision, map.spawn, () =>
      this.animator.onStepComplete(),
    );

    const { spriteWidth: w, spriteHeight: h } = CONFIG.player;
    const { material, depthMaterial } = makeCutoutMaterials(tex);
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    this.mesh.customDepthMaterial = depthMaterial;
    this.mesh.castShadow = true;
    this.mesh.name = 'player';
    this.animator.showIdle(this.movement.facing);
    this.syncMesh();
  }

  static async create(input: Input, collision: CollisionMap, map: MapData): Promise<Player> {
    const tex = await loadPixelTexture('assets/sprites/player.png');
    // 行走图逐帧 UV 动画需要独立纹理实例
    return new Player(tex, input, collision, map);
  }

  /** 地图传送：换碰撞网格 + 硬置站位/朝向，并立即同步网格位置。 */
  warpTo(
    collision: CollisionMap,
    spawn: { x: number; y: number; facing: 'down' | 'up' | 'left' | 'right' },
  ): void {
    this.movement.reset(collision, spawn);
    this.animator.showIdle(spawn.facing);
    this.syncMesh();
  }

  update(dt: number, cameraYaw: number): void {
    this.movement.update(dt, cameraYaw);
    const screenFacing = toScreenDirection(this.movement.facing, cameraYaw);
    if (this.movement.moving) {
      this.animator.showWalk(screenFacing, this.movement.progress);
    } else {
      this.animator.showIdle(screenFacing);
    }
    this.syncMesh();
  }

  get scriptedMoving(): boolean {
    return this.movement.scriptedMoving;
  }

  walkScripted(steps: Direction[]): Promise<void> {
    return this.movement.walkScripted(steps);
  }

  face(direction: Direction, cameraYaw: number): void {
    this.movement.face(direction);
    this.animator.showIdle(toScreenDirection(direction, cameraYaw));
    this.syncMesh();
  }

  private syncMesh(): void {
    const { spriteHeight: h, yOffset } = CONFIG.player;
    // 脚底位于所在 tile 南缘，人物精灵水平居中
    this.mesh.position.set(
      this.movement.worldX + 0.5,
      h / 2 + yOffset,
      this.movement.worldY + 1,
    );
  }
}
