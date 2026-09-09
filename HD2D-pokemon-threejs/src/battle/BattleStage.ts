import * as THREE from 'three';
import { gameAudio, SFX } from '../audio/Bgm';
import { loadPixelTexture } from '../core/AssetLoader';
import type { PostFX } from '../fx/PostFX';
import type { PokemonInstance } from '../story/GameSession';
import type { BattleArenaProfile } from './BattleArena';
import { SPECIES } from './BattleData';
import { POKEMON_ATLAS, type SpeciesId } from './PokemonCatalog';
import {
  getPokemonAnimationView, pokemonAnimationFrameOffset,
  type PokemonAnimationAction, type PokemonAnimationSequence,
} from './PokemonAnimations';
import { BattleTimeline, battleEase } from './BattleTimeline';
import { BATTLE_TUNING } from './BattleTuning';
import { buildBattleEnvironment, type BattleEnvironment } from './BattleEnvironment';
import {
  detectBattleVisualQuality, type BattleVisualQuality,
} from './BattleQuality';
import {
  calculateSpriteFootClearance, getSpeciesPresentation,
} from './BattlePresentation';
import {
  BATTLE_ENTRY_POKEBALL_ASSET, BATTLE_ENTRY_RELEASE_FRAMES, getCaptureOutcomeAsset,
} from './BattleEntryAssets';

type BattleSide = 'player' | 'enemy';

interface BattleStageHost {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  worldRoot: THREE.Group;
  playerMesh: THREE.Object3D;
  arena: BattleArenaProfile;
  postfx: PostFX;
}

interface BattlerVisual {
  species: SpeciesId;
  root: THREE.Group;
  sprite: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  basePosition: THREE.Vector3;
  motionOffset: THREE.Vector3;
  animationScale: THREE.Vector3;
  hitRemaining: number;
  phase: number;
  fainted: boolean;
  shadow: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  baseShadowOpacity: number;
  spriteAnimation?: BattlerSpriteAnimation;
}

interface LoadedAnimationSequence extends PokemonAnimationSequence {
  texture: THREE.Texture;
}

type LoadedAnimationSet = Partial<Record<PokemonAnimationAction, LoadedAnimationSequence>>;

interface LoadedPokemonVisual {
  texture: THREE.Texture;
  frameWidth: number;
  frameHeight: number;
  animations?: LoadedAnimationSet;
}

interface BattlerSpriteAnimation {
  sequences: LoadedAnimationSet;
  action: PokemonAnimationAction;
  elapsed: number;
  frame: number;
  loop: boolean;
}

interface CameraSnapshot {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  fov: number;
}

/**
 * 把像素宝可梦放进当前 Three.js 世界，并临时接管探索相机。
 * 第一阶段只负责构图、落脚、接触阴影和轻量待机/受击反馈。
 */
export class BattleStage {
  private readonly root = new THREE.Group();
  private readonly battlers = new Map<BattleSide, BattlerVisual>();
  private readonly timeline = new BattleTimeline();
  private readonly cameraSnapshot: CameraSnapshot;
  private readonly hiddenObjects: Array<{ object: THREE.Object3D; visible: boolean }> = [];
  private readonly ownedTextures = new Set<THREE.Texture>();
  private readonly battleCameraPosition = new THREE.Vector3();
  private readonly battleCameraDefault = new THREE.Vector3();
  private readonly battleLookAt = new THREE.Vector3();
  private readonly fogSnapshot: THREE.Fog | THREE.FogExp2 | null;
  private readonly backgroundSnapshot: THREE.Color | THREE.Texture | null;
  private readonly battleBackground = new THREE.Color();
  private readonly platformPositions = new Map<BattleSide, THREE.Vector3>();
  private entryBallTexture?: THREE.Texture;
  private entryReleaseTextures: THREE.Texture[] = [];
  readonly quality: BattleVisualQuality;
  readonly arenaKind;
  private environment?: BattleEnvironment;
  private cameraShakeRemaining = 0;
  private cameraShakeStrength = 0;
  private elapsed = 0;
  private disposed = false;

  private constructor(private readonly host: BattleStageHost) {
    this.root.name = 'battle-stage';
    this.cameraSnapshot = {
      position: host.camera.position.clone(),
      quaternion: host.camera.quaternion.clone(),
      fov: host.camera.fov,
    };
    this.fogSnapshot = host.scene.fog;
    this.backgroundSnapshot = host.scene.background;
    this.quality = detectBattleVisualQuality();
    this.arenaKind = host.arena.kind;
    this.battleBackground.setHex(host.arena.background);
  }

  /**
   * mountGate：资源加载与外部转场（闪屏/收黑）并行进行，
   * 但隐藏世界、接管相机等可见改动会等到 gate resolve（屏幕全黑）之后。
   */
  static async create(
    host: BattleStageHost,
    player: PokemonInstance,
    enemy: PokemonInstance,
    mountGate?: Promise<void>,
  ): Promise<BattleStage> {
    const stage = new BattleStage(host);
    await stage.enter(player, enemy, mountGate);
    return stage;
  }

  update(dt: number): void {
    if (this.disposed) return;
    this.timeline.update(dt);
    this.elapsed += dt;
    this.environment?.update(this.elapsed);
    for (const [side, battler] of this.battlers) {
      this.updateSpriteAnimation(battler, dt);
      const breath = battler.fainted ? 0 : Math.sin(this.elapsed * 2.3 + battler.phase);
      battler.root.position.copy(battler.basePosition).add(battler.motionOffset);
      battler.root.position.y += side === 'player'
        ? BATTLE_TUNING.playerFootOffset
        : BATTLE_TUNING.enemyFootOffset;
      battler.root.position.y += breath * 0.035;
      battler.root.scale.set(
        battler.animationScale.x * (1 - breath * 0.009),
        battler.animationScale.y * (1 + breath * 0.018),
        battler.animationScale.z,
      );
      // 只绕竖直轴面向相机，保持脚底落地；不能复制相机俯仰让面片向后倒。
      battler.root.rotation.set(
        0,
        Math.atan2(
          this.host.camera.position.x - battler.root.position.x,
          this.host.camera.position.z - battler.root.position.z,
        ),
        0,
      );
      battler.shadow.position.x = battler.root.position.x;
      battler.shadow.position.z = battler.root.position.z;

      if (battler.hitRemaining > 0) {
        battler.hitRemaining = Math.max(0, battler.hitRemaining - dt);
        const progress = battler.hitRemaining / 0.3;
        const direction = side === 'player' ? -1 : 1;
        battler.root.position.x += Math.sin(progress * Math.PI * 5) * 0.18 * progress * direction;
        battler.sprite.material.emissive.setHex(progress > 0.42 ? 0xffffff : 0x000000);
        battler.sprite.material.emissiveIntensity = progress > 0.42 ? 1.8 : 0;
      } else {
        battler.sprite.material.emissive.setHex(0x000000);
        battler.sprite.material.emissiveIntensity = 0;
      }
    }

    const shake = new THREE.Vector3();
    if (this.cameraShakeRemaining > 0) {
      this.cameraShakeRemaining = Math.max(0, this.cameraShakeRemaining - dt);
      const fade = Math.min(1, this.cameraShakeRemaining / 0.18);
      shake.set(
        Math.sin(this.elapsed * 91) * this.cameraShakeStrength * fade,
        Math.cos(this.elapsed * 73) * this.cameraShakeStrength * 0.55 * fade,
        0,
      );
    }
    this.host.camera.position.copy(this.battleCameraPosition).add(shake);
    this.host.camera.lookAt(this.battleLookAt);
    this.host.scene.background = this.battleBackground;
  }

  async playEntrance(): Promise<void> {
    const cameraStart = this.battleCameraPosition.clone();
    const cameraEnd = this.battleCameraDefault.clone();
    const camera = this.host.camera;
    const cameraMove = this.timeline.tween(this.quality === 'reduced' ? 0.3 : 0.68, (progress) => {
      this.battleCameraPosition.lerpVectors(cameraStart, cameraEnd, progress);
      camera.fov = THREE.MathUtils.lerp(44, 38, progress);
      camera.updateProjectionMatrix();
    }, battleEase.inOutCubic);
    const enemyEntry = this.animateEntrance('enemy');
    const playerEntry = (async () => {
      await this.timeline.delay(0.13);
      await this.throwAndReleasePlayerPokemon();
    })();
    await Promise.all([cameraMove, enemyEntry, playerEntry]);
  }

  async attack(side: BattleSide, target: BattleSide, moveId?: string): Promise<void> {
    const attacker = this.battlers.get(side);
    const defender = this.battlers.get(target);
    if (!attacker || !defender || attacker.fainted) return;
    this.setSpriteAnimation(attacker, 'cry', false);
    if (moveId) gameAudio.playMove(moveId);
    if (this.quality === 'reduced') {
      await this.timeline.delay(0.08);
      return;
    }
    const direction = defender.basePosition.clone().sub(attacker.basePosition);
    direction.y = 0;
    direction.normalize();
    const start = attacker.motionOffset.clone();
    const recoil = direction.clone().multiplyScalar(-0.16);
    await this.timeline.tween(0.11, (progress) => {
      attacker.motionOffset.lerpVectors(start, recoil, progress);
      attacker.animationScale.set(1 + progress * 0.08, 1 - progress * 0.06, 1);
    }, battleEase.inCubic);

    const lunge = direction.multiplyScalar(side === 'player' ? 0.92 : 0.72);
    const cameraPush = this.pushCameraToward(target);
    await this.timeline.tween(0.14, (progress) => {
      attacker.motionOffset.lerpVectors(recoil, lunge, progress);
      attacker.animationScale.set(1 - progress * 0.05, 1 + progress * 0.08, 1);
    }, battleEase.outCubic);
    await this.timeline.tween(0.24, (progress) => {
      attacker.motionOffset.lerpVectors(lunge, start, progress);
      attacker.animationScale.lerpVectors(
        new THREE.Vector3(0.95, 1.08, 1), new THREE.Vector3(1, 1, 1), progress,
      );
    }, battleEase.outCubic);
    await cameraPush;
    attacker.motionOffset.copy(start);
    attacker.animationScale.set(1, 1, 1);
  }

  async hit(side: BattleSide): Promise<void> {
    const battler = this.battlers.get(side);
    if (!battler || battler.fainted) return;
    gameAudio.playSfx(SFX.hitNormal, 0.78);
    this.setSpriteAnimation(battler, 'hurt', false);
    battler.hitRemaining = 0.3;
    if (this.quality === 'reduced') {
      await this.timeline.delay(0.12);
      return;
    }
    this.cameraShakeRemaining = 0.24;
    this.cameraShakeStrength = side === 'player' ? 0.11 : 0.08;
    void this.spawnImpact(side);
    const start = battler.motionOffset.clone();
    const away = new THREE.Vector3(side === 'player' ? -0.28 : 0.28, 0.08, 0);
    await this.timeline.tween(0.08, (progress) => {
      battler.motionOffset.lerpVectors(start, away, progress);
    }, battleEase.outCubic);
    await this.timeline.tween(0.24, (progress) => {
      battler.motionOffset.lerpVectors(away, start, progress);
    }, battleEase.outBack);
    battler.motionOffset.copy(start);
  }

  async faint(side: BattleSide): Promise<void> {
    const battler = this.battlers.get(side);
    if (!battler || battler.fainted) return;
    battler.fainted = true;
    if (this.quality === 'reduced') {
      battler.root.visible = false;
      battler.shadow.visible = false;
      return;
    }
    const startOffset = battler.motionOffset.clone();
    const shadowOpacity = battler.shadow.material.opacity;
    await this.timeline.tween(0.58, (progress) => {
      battler.motionOffset.copy(startOffset).add(new THREE.Vector3(0, -1.25 * progress, 0));
      battler.animationScale.set(1 + progress * 0.12, 1 - progress * 0.72, 1);
      battler.sprite.material.opacity = 1 - progress;
      battler.shadow.material.opacity = shadowOpacity * (1 - progress);
    }, battleEase.inCubic);
    battler.root.visible = false;
    battler.shadow.visible = false;
  }

  async captureAttempt(
    shakes: number,
    caught: boolean,
    _ballColor: number,
    holdCaughtBall = false,
    deliberateShakes = false,
  ): Promise<void> {
    const enemy = this.battlers.get('enemy');
    const player = this.battlers.get('player');
    if (!enemy || !player || enemy.fainted || !this.entryBallTexture
      || this.entryReleaseTextures.length === 0) return;

    const material = new THREE.SpriteMaterial({
      map: this.entryBallTexture,
      transparent: true,
      alphaTest: 0.12,
      depthWrite: false,
    });
    const ball = new THREE.Sprite(material);
    ball.name = 'battle-capture-ball';
    const start = player.basePosition.clone().add(new THREE.Vector3(0.45, 1.8, 0));
    const impact = enemy.basePosition.clone().add(new THREE.Vector3(0, 0.9, 0));
    const resting = this.platformPositions.get('enemy')!.clone().add(new THREE.Vector3(0, 0.27, 0));
    ball.position.copy(start);
    ball.scale.set(0.01, 0.01, 1);
    this.root.add(ball);
    gameAudio.playSfx(SFX.throwBall, 0.76);

    const throwDuration = this.quality === 'reduced' ? 0.12 : 0.52;
    await this.timeline.tween(throwDuration, (progress) => {
      ball.position.lerpVectors(start, impact, progress);
      ball.position.y += Math.sin(progress * Math.PI) * 2.2;
      material.rotation = progress * Math.PI * 5;
      const scale = Math.min(0.74, progress * 3.7);
      ball.scale.set(scale, scale, 1);
    }, battleEase.inOutCubic);
    gameAudio.playSfx(SFX.ballHit, 0.82);

    const enemyShadowOpacity = enemy.shadow.material.opacity;
    material.rotation = 0;
    gameAudio.playSfx(SFX.ballAbsorb, 0.78);
    await Promise.all([
      this.playPokeballFrames(ball, material, this.entryReleaseTextures),
      this.timeline.tween(this.quality === 'reduced' ? 0.2 : 0.42, (progress) => {
        enemy.animationScale.setScalar(Math.max(0.01, 1 - progress));
        enemy.sprite.material.opacity = 1 - progress;
        enemy.shadow.material.opacity = enemyShadowOpacity * (1 - progress);
      }, battleEase.inCubic),
    ]);
    enemy.root.visible = false;
    enemy.shadow.visible = false;

    await this.playPokeballFrames(
      ball,
      material,
      [...this.entryReleaseTextures].reverse(),
    );
    material.map = this.entryBallTexture;
    material.needsUpdate = true;
    await this.timeline.tween(this.quality === 'reduced' ? 0.08 : 0.2, (progress) => {
      ball.position.lerpVectors(impact, resting, progress);
    }, battleEase.inCubic);
    ball.position.copy(resting);
    ball.scale.set(0.74, 0.74, 1);
    gameAudio.playSfx(SFX.ballDrop, 0.72);

    for (let shake = 0; shake < shakes; shake++) {
      const direction = shake % 2 === 0 ? 1 : -1;
      gameAudio.playSfx(SFX.ballShake, 0.9);
      const shakeDuration = deliberateShakes
        ? (this.quality === 'reduced' ? 0.24 : 0.42)
        : (this.quality === 'reduced' ? 0.06 : 0.2);
      await this.timeline.tween(shakeDuration, (progress) => {
        material.rotation = Math.sin(progress * Math.PI * 2) * 0.42 * direction;
      }, battleEase.inOutCubic);
      const decisionPause = deliberateShakes
        ? (this.quality === 'reduced' ? 0.3 : 0.46)
        : (this.quality === 'reduced' ? 0.02 : 0.16);
      await this.timeline.delay(decisionPause);
    }
    material.rotation = 0;

    if (caught) {
      gameAudio.playSfx(SFX.ballClick, 0.92);
      material.map = this.textureForAsset(getCaptureOutcomeAsset(true));
      material.needsUpdate = true;
      await this.spawnCaptureSparkles(resting);
      gameAudio.playSfx(SFX.captureSuccess, 0.7);
      await this.timeline.tween(this.quality === 'reduced' ? 0.08 : 0.28, (progress) => {
        const scale = 0.74 * (1 + Math.sin(progress * Math.PI) * 0.3);
        ball.scale.set(scale, scale, 1);
      }, battleEase.outBack);
    } else {
      enemy.root.visible = true;
      enemy.shadow.visible = true;
      enemy.sprite.material.opacity = 0;
      await Promise.all([
        this.playPokeballFrames(ball, material, this.entryReleaseTextures),
        this.timeline.tween(this.quality === 'reduced' ? 0.2 : 0.42, (progress) => {
          enemy.animationScale.setScalar(Math.max(0.01, progress));
          enemy.sprite.material.opacity = progress;
          enemy.shadow.material.opacity = enemyShadowOpacity * progress;
        }, battleEase.outBack),
      ]);
      material.map = this.textureForAsset(getCaptureOutcomeAsset(false));
      material.needsUpdate = true;
      await this.timeline.delay(this.quality === 'reduced' ? 0.05 : 0.14);
      enemy.animationScale.set(1, 1, 1);
      enemy.sprite.material.opacity = 1;
      enemy.shadow.material.opacity = enemyShadowOpacity;
    }

    // 宣传片收尾需要把成功捕获后的球保留在场地上，随 BattleStage 一起销毁。
    if (!caught || !holdCaughtBall) {
      this.root.remove(ball);
      material.dispose();
    }
  }

  async victory(side: BattleSide): Promise<void> {
    const battler = this.battlers.get(side);
    if (!battler || battler.fainted) return;
    if (this.quality === 'reduced') {
      await this.timeline.delay(0.08);
      return;
    }
    const cameraMove = this.pushCameraToward(side, 0.42);
    for (let hop = 0; hop < 2; hop++) {
      await this.timeline.tween(0.28, (progress) => {
        battler.motionOffset.y = Math.sin(progress * Math.PI) * (hop === 0 ? 0.34 : 0.22);
        battler.animationScale.set(1 + Math.sin(progress * Math.PI) * 0.06, 1, 1);
      }, battleEase.inOutCubic);
    }
    battler.motionOffset.set(0, 0, 0);
    battler.animationScale.set(1, 1, 1);
    await cameraMove;
  }

  async playExit(): Promise<void> {
    if (this.quality === 'reduced') {
      for (const battler of this.battlers.values()) battler.sprite.material.opacity = 0;
      return;
    }
    const start = this.battleCameraPosition.clone();
    const end = start.clone().add(new THREE.Vector3(0, 0.35, 1.25));
    await this.timeline.tween(0.46, (progress) => {
      this.battleCameraPosition.lerpVectors(start, end, progress);
      for (const battler of this.battlers.values()) {
        battler.sprite.material.opacity = 1 - progress;
      }
    }, battleEase.inCubic);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.timeline.clear();
    this.host.scene.remove(this.root);
    this.root.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.dispose();
        object.customDepthMaterial?.dispose();
      } else if (object instanceof THREE.Sprite) {
        object.material.dispose();
      }
    });
    for (const entry of this.hiddenObjects) entry.object.visible = entry.visible;
    for (const texture of this.ownedTextures) texture.dispose();
    this.host.scene.fog = this.fogSnapshot;
    this.host.scene.background = this.backgroundSnapshot;
    this.host.postfx.exitBattleMode();
    this.host.camera.position.copy(this.cameraSnapshot.position);
    this.host.camera.quaternion.copy(this.cameraSnapshot.quaternion);
    this.host.camera.fov = this.cameraSnapshot.fov;
    this.host.camera.updateProjectionMatrix();
  }

  private async enter(
    player: PokemonInstance,
    enemy: PokemonInstance,
    mountGate?: Promise<void>,
  ): Promise<void> {
    const center = this.host.arena.center.clone();
    center.y = 0;
    const [playerVisual, enemyVisual, platformTexture, environment, entryTextures] = await Promise.all([
      this.loadPokemonVisual('back', player.species, SPECIES[player.species].spriteIndex),
      this.loadPokemonVisual('front', enemy.species, SPECIES[enemy.species].spriteIndex),
      loadPixelTexture('assets/battle/platform/battle-platform-top.png'),
      buildBattleEnvironment(center, this.quality, this.host.arena.kind),
      Promise.all([
        loadPixelTexture(BATTLE_ENTRY_POKEBALL_ASSET),
        ...BATTLE_ENTRY_RELEASE_FRAMES.map((source) => loadPixelTexture(source)),
      ]),
    ]);
    if (mountGate) await mountGate;

    this.environment = environment;
    [this.entryBallTexture, ...this.entryReleaseTextures] = entryTextures;
    this.root.add(environment.root);
    for (const texture of environment.textures) this.ownedTextures.add(texture);
    this.host.postfx.enterBattleMode(this.quality);

    // 战斗场地是独立布景：进入时整张探索地图退场，退出后按原 visible 状态恢复。
    this.hideDuringBattle(this.host.worldRoot);
    this.hideDuringBattle(this.host.playerMesh);
    this.host.scene.fog = new THREE.FogExp2(
      this.host.arena.fogColor, this.host.arena.fogDensity,
    );
    this.host.scene.background = this.battleBackground;
    const playerPosition = center.clone().add(
      new THREE.Vector3(-3.05, 0.025, 2.05),
    );
    const enemyPosition = center.clone().add(
      new THREE.Vector3(2.8, 0.025, -2.05),
    );
    this.platformPositions.set('player', playerPosition.clone());
    this.platformPositions.set('enemy', enemyPosition.clone());

    this.root.add(
      this.createPlatform(
        playerPosition, 3.7, 1.62, true, platformTexture,
      ),
      this.createPlatform(
        enemyPosition, 2.85, 1.18, false, platformTexture,
      ),
    );
    this.addBattler('player', playerVisual, playerPosition, player, 0.5);
    this.addBattler('enemy', enemyVisual, enemyPosition, enemy, 2.2);
    this.host.scene.add(this.root);

    const camera = this.host.camera;
    this.battleCameraDefault.copy(center).add(this.host.arena.cameraOffset);
    this.battleCameraPosition.copy(this.battleCameraDefault).add(new THREE.Vector3(0, 0.35, 1.2));
    this.battleLookAt.copy(center).add(this.host.arena.lookAtOffset);
    camera.fov = 44;
    camera.position.copy(this.battleCameraPosition);
    camera.lookAt(this.battleLookAt);
    camera.updateProjectionMatrix();
  }

  /** 背面全部复用待机动画；没有正面动画的物种才读取静态图集。 */
  private async loadPokemonVisual(
    view: 'front' | 'back',
    species: SpeciesId,
    spriteIndex: number,
  ): Promise<LoadedPokemonVisual> {
    const animationDefinition = await getPokemonAnimationView(species, view);
    if (animationDefinition?.idle) {
      const actions: PokemonAnimationAction[] = ['idle', 'cry', 'hurt'];
      const loaded = await Promise.all(actions.flatMap((action) => {
        const sequence = animationDefinition[action];
        if (!sequence) return [];
        return [loadPixelTexture(sequence.url).then((source) => {
          const texture = source.clone();
          texture.repeat.set(1 / sequence.columns, 1 / sequence.rows);
          const [offsetX, offsetY] = pokemonAnimationFrameOffset(sequence, 0);
          texture.offset.set(offsetX, offsetY);
          texture.needsUpdate = true;
          this.ownedTextures.add(texture);
          return [action, { ...sequence, texture }] as const;
        })];
      }));
      const animations = Object.fromEntries(loaded) as LoadedAnimationSet;
      const idle = animations.idle!;
      return {
        texture: idle.texture,
        frameWidth: idle.frameWidth,
        frameHeight: idle.frameHeight,
        animations,
      };
    }

    if (view === 'back') throw new Error(`缺少背面待机动画定义: ${species}`);
    const source = await loadPixelTexture(POKEMON_ATLAS.frontTexture);
    const canvas = document.createElement('canvas');
    const sourceImage = source.image as CanvasImageSource;
    canvas.width = POKEMON_ATLAS.cellSize;
    canvas.height = POKEMON_ATLAS.cellSize;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法创建宝可梦图集画布');
    context.imageSmoothingEnabled = false;
    const column = spriteIndex % POKEMON_ATLAS.columns;
    const row = Math.floor(spriteIndex / POKEMON_ATLAS.columns);
    context.drawImage(
      sourceImage,
      column * POKEMON_ATLAS.cellSize,
      row * POKEMON_ATLAS.cellSize,
      canvas.width,
      canvas.height,
      0,
      0,
      canvas.width,
      canvas.height,
    );

    // 图集单元统一为 64x64，但不同物种四周透明留白不同。
    // 裁到真实 alpha 包围盒后，PlaneGeometry 的下边缘才等于可见脚底。
    const pixels = context.getImageData(
      0, 0, canvas.width, canvas.height,
    ).data;
    let minX: number = canvas.width;
    let minY: number = canvas.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        if (pixels[(y * canvas.width + x) * 4 + 3] <= 16) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    const cropped = document.createElement('canvas');
    if (maxX >= minX && maxY >= minY) {
      cropped.width = maxX - minX + 1;
      cropped.height = maxY - minY + 1;
      const croppedContext = cropped.getContext('2d');
      if (!croppedContext) throw new Error('无法创建宝可梦裁切画布');
      croppedContext.imageSmoothingEnabled = false;
      croppedContext.drawImage(
        canvas,
        minX, minY, cropped.width, cropped.height,
        0, 0, cropped.width, cropped.height,
      );
    } else {
      cropped.width = canvas.width;
      cropped.height = canvas.height;
      cropped.getContext('2d')?.drawImage(canvas, 0, 0);
    }

    const texture = new THREE.CanvasTexture(cropped);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    this.ownedTextures.add(texture);
    return {
      texture,
      frameWidth: cropped.width,
      frameHeight: cropped.height,
    };
  }

  private hideDuringBattle(object: THREE.Object3D): void {
    this.hiddenObjects.push({ object, visible: object.visible });
    object.visible = false;
  }

  private addBattler(
    side: BattleSide,
    visual: LoadedPokemonVisual,
    position: THREE.Vector3,
    pokemon: PokemonInstance,
    phase: number,
  ): void {
    const presentation = getSpeciesPresentation(pokemon.species);
    const height = presentation.worldHeight;
    const footClearance = calculateSpriteFootClearance(
      height,
      visual.frameHeight,
    );
    const root = new THREE.Group();
    root.name = `battle-battler-${side}`;
    root.position.copy(position).add(new THREE.Vector3(
      0,
      height / 2 + presentation.footLift + footClearance,
      0,
    ));

    const material = new THREE.MeshStandardMaterial({
      map: visual.texture,
      transparent: true,
      alphaTest: 0.18,
      depthWrite: true,
      side: THREE.DoubleSide,
      roughness: 1,
      metalness: 0,
      opacity: 0,
    });
    const aspect = visual.frameWidth / visual.frameHeight;
    const fittedWidth = height * aspect * presentation.widthScale;
    const sprite = new THREE.Mesh(
      new THREE.PlaneGeometry(fittedWidth, height),
      material,
    );
    sprite.position.set(
      (0.5 - presentation.footAnchor[0]) * fittedWidth,
      (1 - presentation.footAnchor[1]) * height,
      0,
    );
    sprite.name = `battle-sprite-${side}`;
    sprite.castShadow = true;
    sprite.customDepthMaterial = new THREE.MeshDepthMaterial({
      map: visual.texture,
      alphaTest: 0.18,
      depthPacking: THREE.RGBADepthPacking,
    });
    root.add(sprite);
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.9, 28),
      new THREE.MeshBasicMaterial({ color: 0x111714, transparent: true,
        opacity: 0, depthWrite: false }),
    );
    shadow.name = `battle-contact-shadow-${side}`;
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(presentation.shadowScale * 1.15, presentation.shadowScale * 0.48, 1);
    shadow.position.set(position.x, position.y + 0.021, position.z);
    this.root.add(shadow, root);
    this.battlers.set(side, {
      species: pokemon.species,
      root,
      sprite,
      basePosition: root.position.clone(),
      motionOffset: new THREE.Vector3(),
      animationScale: new THREE.Vector3(0.01, 0.01, 0.01),
      hitRemaining: 0,
      phase,
      fainted: false,
      shadow,
      baseShadowOpacity: presentation.shadowOpacity,
      spriteAnimation: visual.animations ? {
        sequences: visual.animations,
        action: 'idle',
        elapsed: 0,
        frame: 0,
        loop: true,
      } : undefined,
    });
  }

  async switchPlayer(pokemon: PokemonInstance): Promise<void> {
    gameAudio.playSfx(SFX.partySwitch, 0.72);
    const previous = this.battlers.get('player');
    if (previous) {
      if (this.quality === 'full') {
        const shadowOpacity = previous.shadow.material.opacity;
        await this.timeline.tween(0.22, (progress) => {
          previous.animationScale.setScalar(Math.max(0.01, 1 - progress));
          previous.sprite.material.opacity = 1 - progress;
          previous.shadow.material.opacity = shadowOpacity * (1 - progress);
        }, battleEase.inCubic);
      }
      this.root.remove(previous.root, previous.shadow);
      previous.root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
        object.customDepthMaterial?.dispose();
      });
      previous.shadow.geometry.dispose();
      previous.shadow.material.dispose();
    }
    const visual = await this.loadPokemonVisual(
      'back', pokemon.species, SPECIES[pokemon.species].spriteIndex,
    );
    this.addBattler('player', visual, this.platformPositions.get('player')!, pokemon, 0.5);
    gameAudio.playSfx(SFX.releasePokemon, 0.76);
    await this.animateEntrance('player');
  }

  private async animateEntrance(side: BattleSide): Promise<void> {
    const battler = this.battlers.get(side);
    if (!battler) return;
    this.setSpriteAnimation(battler, 'cry', false);
    gameAudio.playCry(battler.species);
    const shadowOpacity = battler.baseShadowOpacity;
    battler.sprite.material.opacity = 0;
    battler.shadow.material.opacity = 0;
    battler.motionOffset.y = -0.28;
    await this.timeline.tween(this.quality === 'reduced' ? 0.2 : 0.48, (progress) => {
      battler.animationScale.setScalar(Math.max(0.01, progress));
      battler.motionOffset.y = THREE.MathUtils.lerp(-0.28, 0, progress);
      battler.sprite.material.opacity = Math.min(1, progress * 1.6);
      battler.shadow.material.opacity = shadowOpacity * progress;
    }, battleEase.outBack);
    battler.animationScale.set(1, 1, 1);
    battler.motionOffset.set(0, 0, 0);
    battler.sprite.material.opacity = 1;
    battler.shadow.material.opacity = shadowOpacity;
  }

  /** 玩家先从镜头近侧抛球，球到落点后播放 Release 1–11，再生成己方宝可梦。 */
  private async throwAndReleasePlayerPokemon(): Promise<void> {
    const battler = this.battlers.get('player');
    if (!battler || !this.entryBallTexture || this.entryReleaseTextures.length === 0) {
      await this.animateEntrance('player');
      return;
    }

    const material = new THREE.SpriteMaterial({
      map: this.entryBallTexture,
      transparent: true,
      alphaTest: 0.12,
      depthWrite: false,
    });
    const ball = new THREE.Sprite(material);
    ball.name = 'battle-entry-pokeball';
    ball.scale.set(0.72, 0.72, 1);
    const target = this.platformPositions.get('player')!.clone().add(new THREE.Vector3(0, 1.35, 0));
    const start = target.clone().add(new THREE.Vector3(-2.25, -0.62, 1.15));
    ball.position.copy(start);
    this.root.add(ball);
    gameAudio.playSfx(SFX.throwBall, 0.76);

    await this.timeline.tween(this.quality === 'reduced' ? 0.3 : 0.58, (progress) => {
      ball.position.lerpVectors(start, target, progress);
      ball.position.y += Math.sin(progress * Math.PI) * 1.65;
      material.rotation = progress * Math.PI * 5;
      const scale = THREE.MathUtils.lerp(0.5, 0.78, progress);
      ball.scale.set(scale, scale, 1);
    }, battleEase.inOutCubic);

    material.rotation = 0;
    gameAudio.playSfx(SFX.releasePokemon, 0.82);
    const releaseFrameDuration = this.quality === 'reduced' ? 0.028 : 0.05;
    for (let frame = 0; frame < this.entryReleaseTextures.length; frame++) {
      material.map = this.entryReleaseTextures[frame];
      material.needsUpdate = true;
      const progress = frame / Math.max(1, this.entryReleaseTextures.length - 1);
      const pulse = 1 + Math.sin(progress * Math.PI) * 0.18;
      ball.scale.set(0.78 * pulse, 0.78 * pulse, 1);
      // 逐帧等待可避免低帧率设备按总进度取样时跳过 Release 中间帧。
      await this.timeline.delay(releaseFrameDuration);
    }

    this.root.remove(ball);
    material.dispose();
    await this.animateEntrance('player');
  }

  private async playPokeballFrames(
    ball: THREE.Sprite,
    material: THREE.SpriteMaterial,
    frames: readonly THREE.Texture[],
  ): Promise<void> {
    const frameDuration = this.quality === 'reduced' ? 0.028 : 0.05;
    for (let frame = 0; frame < frames.length; frame++) {
      material.map = frames[frame];
      material.needsUpdate = true;
      const progress = frame / Math.max(1, frames.length - 1);
      const pulse = 1 + Math.sin(progress * Math.PI) * 0.18;
      ball.scale.set(0.74 * pulse, 0.74 * pulse, 1);
      await this.timeline.delay(frameDuration);
    }
  }

  private textureForAsset(asset: string): THREE.Texture {
    if (asset === BATTLE_ENTRY_POKEBALL_ASSET) return this.entryBallTexture!;
    const index = BATTLE_ENTRY_RELEASE_FRAMES.indexOf(asset);
    return this.entryReleaseTextures[index] ?? this.entryBallTexture!;
  }

  private setSpriteAnimation(
    battler: BattlerVisual,
    action: PokemonAnimationAction,
    loop: boolean,
  ): void {
    const animation = battler.spriteAnimation;
    const sequence = animation?.sequences[action];
    if (!animation || !sequence) return;
    animation.action = action;
    animation.elapsed = 0;
    animation.frame = -1;
    animation.loop = loop;
    this.applySpriteAnimationFrame(battler, sequence, 0);
  }

  private updateSpriteAnimation(battler: BattlerVisual, dt: number): void {
    const animation = battler.spriteAnimation;
    if (!animation) return;
    const sequence = animation.sequences[animation.action];
    if (!sequence) return;
    animation.elapsed += dt;
    const rawFrame = Math.floor(animation.elapsed * sequence.fps);
    if (!animation.loop && rawFrame >= sequence.frames) {
      this.setSpriteAnimation(battler, 'idle', true);
      return;
    }
    const frame = animation.loop ? rawFrame % sequence.frames : rawFrame;
    if (frame !== animation.frame) this.applySpriteAnimationFrame(battler, sequence, frame);
  }

  private applySpriteAnimationFrame(
    battler: BattlerVisual,
    sequence: LoadedAnimationSequence,
    frame: number,
  ): void {
    const animation = battler.spriteAnimation;
    if (!animation) return;
    const [offsetX, offsetY] = pokemonAnimationFrameOffset(sequence, frame);
    sequence.texture.offset.set(offsetX, offsetY);
    battler.sprite.material.map = sequence.texture;
    battler.sprite.material.needsUpdate = true;
    if (battler.sprite.customDepthMaterial) {
      const depthMaterial = battler.sprite.customDepthMaterial as THREE.MeshDepthMaterial;
      depthMaterial.map = sequence.texture;
      depthMaterial.needsUpdate = true;
    }
    animation.frame = frame;
  }

  private async pushCameraToward(side: BattleSide, amount = 0.3): Promise<void> {
    const battler = this.battlers.get(side);
    if (!battler) return;
    const start = this.battleCameraPosition.clone();
    const direction = battler.basePosition.clone().sub(start).normalize();
    const pushed = start.clone().add(direction.multiplyScalar(amount));
    await this.timeline.tween(0.16, (progress) => {
      this.battleCameraPosition.lerpVectors(start, pushed, progress);
    }, battleEase.outCubic);
    await this.timeline.tween(0.28, (progress) => {
      this.battleCameraPosition.lerpVectors(pushed, this.battleCameraDefault, progress);
    }, battleEase.inOutCubic);
    this.battleCameraPosition.copy(this.battleCameraDefault);
  }

  private async spawnImpact(side: BattleSide): Promise<void> {
    const battler = this.battlers.get(side);
    if (!battler || this.disposed) return;
    const group = new THREE.Group();
    group.name = 'battle-impact';
    group.position.copy(battler.basePosition).add(new THREE.Vector3(0, 1.35, 0));
    const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    const materials: THREE.MeshBasicMaterial[] = [];
    const rays: THREE.Vector3[] = [];
    for (let index = 0; index < 10; index++) {
      const material = new THREE.MeshBasicMaterial({
        color: index % 2 ? 0xfff2a8 : 0xffffff,
        transparent: true,
        depthWrite: false,
      });
      const particle = new THREE.Mesh(geometry, material);
      const angle = index / 10 * Math.PI * 2;
      rays.push(new THREE.Vector3(Math.cos(angle), Math.sin(angle), (index % 3 - 1) * 0.08));
      group.add(particle);
      materials.push(material);
    }
    this.root.add(group);
    await this.timeline.tween(0.34, (progress) => {
      group.children.forEach((particle, index) => {
        particle.position.copy(rays[index]).multiplyScalar(progress * 0.7);
        particle.scale.setScalar(Math.max(0.01, 1 - progress));
        materials[index].opacity = 1 - progress;
      });
    }, battleEase.outCubic);
    this.root.remove(group);
    geometry.dispose();
    for (const material of materials) material.dispose();
  }

  private async spawnCaptureSparkles(position: THREE.Vector3): Promise<void> {
    const group = new THREE.Group();
    group.name = 'battle-capture-sparkles';
    group.position.copy(position);
    const geometry = new THREE.BoxGeometry(0.09, 0.09, 0.09);
    const materials: THREE.MeshBasicMaterial[] = [];
    const rays: THREE.Vector3[] = [];
    const count = this.quality === 'full' ? 12 : 6;
    for (let index = 0; index < count; index++) {
      const material = new THREE.MeshBasicMaterial({ color: index % 2 ? 0xffed72 : 0xffffff,
        transparent: true, depthWrite: false });
      const sparkle = new THREE.Mesh(geometry, material);
      const angle = index / count * Math.PI * 2;
      rays.push(new THREE.Vector3(Math.cos(angle), 0.45 + Math.sin(angle * 2) * 0.25, Math.sin(angle)));
      group.add(sparkle);
      materials.push(material);
    }
    this.root.add(group);
    await this.timeline.tween(this.quality === 'reduced' ? 0.08 : 0.38, (progress) => {
      group.children.forEach((sparkle, index) => {
        sparkle.position.copy(rays[index]).multiplyScalar(progress * 0.75);
        sparkle.scale.setScalar(Math.max(0.01, 1 - progress));
        materials[index].opacity = 1 - progress;
      });
    }, battleEase.outCubic);
    this.root.remove(group);
    geometry.dispose();
    materials.forEach((material) => material.dispose());
  }

  private createPlatform(
    position: THREE.Vector3,
    width: number,
    depth: number,
    near: boolean,
    topTexture: THREE.Texture,
  ): THREE.Group {
    const group = new THREE.Group();
    group.name = near ? 'battle-platform-player' : 'battle-platform-enemy';
    group.position.set(position.x, 0, position.z);
    const texturePlane = new THREE.Mesh(
      new THREE.PlaneGeometry(width * 2, depth * 2),
      new THREE.MeshStandardMaterial({
        map: topTexture,
        color: near
          ? this.host.arena.platformTopTint
          : new THREE.Color(this.host.arena.platformTopTint).multiplyScalar(0.9),
        transparent: true,
        alphaTest: 0.08,
        depthWrite: true,
        roughness: 1,
        side: THREE.DoubleSide,
      }),
    );
    texturePlane.name = near ? 'battle-platform-texture-player' : 'battle-platform-texture-enemy';
    texturePlane.rotation.x = -Math.PI / 2;
    texturePlane.position.y = 0.01;
    texturePlane.receiveShadow = true;
    group.add(texturePlane);
    return group;
  }
}
