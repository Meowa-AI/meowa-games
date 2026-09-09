import * as THREE from 'three';
import { createRenderer } from './Renderer';
import { DebugMode } from './DebugMode';
import { CONFIG } from '../config';
import { getMap } from '../map/maps';
import type { MapData, MapWarp } from '../map/MapData';
import { CollisionMap } from '../map/CollisionMap';
import { buildGround } from '../map/GroundBuilder';
import { buildProps } from '../map/PropsBuilder';
import { buildInterior } from '../map/InteriorBuilder';
import { createLights } from '../fx/Lights';
import { DayNight } from '../fx/DayNight';
import { LightShafts } from '../fx/LightShafts';
import { Fireflies } from '../fx/Particles';
import { PostFX } from '../fx/PostFX';
import { DIR_VECTORS, Input } from '../input/Input';
import type { Direction } from '../input/Input';
import { Player } from '../player/Player';
import { CameraRig } from '../camera/CameraRig';
import { gameAudio, SFX } from '../audio/Bgm';
import { buildNpcs } from '../npc/NpcBuilder';
import { DialogueBox } from '../dialogue/DialogueBox';
import { GameSession, type SpeciesId, type StoryPhase } from '../story/GameSession';
import { ObjectiveHud } from '../story/ObjectiveHud';
import { ChoiceMenu } from '../ui/ChoiceMenu';
import { TextEntry } from '../ui/TextEntry';
import {
  BattleScreen, type BattleOptions, type BattleResult,
} from '../battle/BattleScreen';
import { createPokemon, SPECIES } from '../battle/BattleData';
import { POKEMON_ATLAS } from '../battle/PokemonCatalog';
import { BattleStage } from '../battle/BattleStage';
import { BattleTransition } from '../battle/BattleTransition';
import { detectBattleVisualQuality } from '../battle/BattleQuality';
import { isBattleArenaKind, selectBattleArena } from '../battle/BattleArena';
import { WildEncounterController, type WildEncounter } from '../encounter/WildEncounter';

interface WorldInteraction {
  interactAt: (
    x: number, y: number, playerX: number, playerY: number,
  ) => { speaker: string; pages: string[]; interactionId?: string } | undefined;
  refresh: () => void;
  endInteraction: () => void;
  walkActor: (id: string, steps: Direction[]) => Promise<void>;
  faceActor: (id: string, direction: Direction) => void;
}

/** 一张已装配地图的运行时对象；按 id 缓存，重复进出即时切换。 */
interface World {
  map: MapData;
  root: THREE.Group;
  collision: CollisionMap;
  update: (elapsed: number, dt: number, yaw: number, px: number, py: number) => void;
  interaction?: WorldInteraction;
}

interface PromoState {
  token: number;
  active: boolean;
  world: World;
  originalWorld: World;
  originalBackground: THREE.Color | THREE.Texture | null;
  originalPlayerVisible: boolean;
  originalDayTime?: number;
  originalDayRunning?: boolean;
  player: Player;
  elapsed: number;
  transition?: BattleTransition;
  stage?: BattleStage;
  mountBattle?: () => void;
}

/**
 * 游戏主类：装配地图、主角、相机、光照、后期，驱动更新循环。
 * 多地图以 World 为单位构建缓存，踏上 warp 格淡出切换。
 * F9 切换调试 UI 与相机视角编辑；正常游戏中相机保持锁定跟随。
 */
export class Game {
  private readonly renderer = createRenderer();
  private readonly scene = new THREE.Scene();
  private readonly clock = new THREE.Clock();
  private readonly bgm = gameAudio;
  private readonly input = new Input();
  private readonly dialogue = new DialogueBox();
  private readonly session = GameSession.load();
  private readonly objective = new ObjectiveHud();
  private rig!: CameraRig;
  private player!: Player;
  private postfx!: PostFX;
  private dayNight?: DayNight;
  private readonly worlds = new Map<string, World>();
  private world!: World;
  private warping = false;
  private storyBusy = false;
  private entryStoryStarted = false;
  private readonly firedTriggers = new Set<string>();
  private readonly wildEncounters = new WildEncounterController();
  private battleStage?: BattleStage;
  private lastTileX = -1;
  private lastTileY = -1;
  private readonly fade = Game.createFadeOverlay();
  private readonly cameraModeOverlay = Game.createCameraModeOverlay();
  private readonly promoBattleHud = Game.createPromoBattleHud();
  private readonly cameraModeListeners = new Set<(active: boolean) => void>();
  private promo?: PromoState;
  private cinematicPlayer?: Player;
  private promoToken = 0;
  private cameraModeStarting = false;
  private elapsed = 0;

  async init(): Promise<void> {
    const bgmReady = this.bgm.start();
    // 调试入口：?map=<id> 直接从指定地图的出生点开始（如 ?map=rival-house-1f）
    const debugMap = new URLSearchParams(location.search).get('map');
    const initialMap = debugMap ?? this.session.currentMap;
    const world = await this.loadWorld(initialMap);
    this.world = world;
    this.scene.add(world.root);
    this.scene.background = new THREE.Color(
      world.map.background ?? CONFIG.clearColor,
    );

    this.player = await Player.create(this.input, world.collision, world.map);
    this.scene.add(this.player.mesh);
    if (!debugMap) this.player.warpTo(world.collision, this.session.player);
    this.lastTileX = this.player.movement.tileX;
    this.lastTileY = this.player.movement.tileY;
    this.objective.set(this.session.phase);

    this.rig = new CameraRig(world.map);
    this.rig.snapTo(this.player.mesh.position.x, this.player.mesh.position.z);
    this.rig.attach(this.renderer.domElement);
    window.addEventListener('resize', () => this.rig.onResize());
    // lil-gui 中按钮保持焦点时也要能触发，因此在捕获阶段处理宣传片快捷键。
    window.addEventListener('keydown', (event) => {
      if (event.code === 'F8') {
        event.preventDefault();
        this.setCameraMode(!this.cameraModeActive);
      } else if (event.code === 'Escape' && this.cameraModeActive) {
        event.preventDefault();
        this.setCameraMode(false);
      }
    }, true);

    this.postfx = new PostFX(this.renderer, this.scene, this.rig.camera);

    // 调试 UI（时间 HUD + 调参面板）：F9 切换，懒加载面板
    let gui: import('lil-gui').default | undefined;
    DebugMode.onChange((on) => {
      this.objective.setVisible(on && !this.cameraModeActive);
      this.rig.setInteractive(on && !this.cameraModeActive);
      if (on && !gui) {
        void import('../fx/DebugPanel').then(({ createDebugPanel }) => {
          const lights = world.root.getObjectByName('lights');
          const currentGame = this;
          gui = createDebugPanel(
            this.postfx,
            lights as THREE.Group | undefined,
            this.dayNight,
            () => this.session.reset(),
            {
              get active() { return currentGame.cameraModeActive; },
              toggle: () => this.setCameraMode(!this.cameraModeActive),
              onChange: (listener) => {
                this.cameraModeListeners.add(listener);
                listener(this.cameraModeActive);
              },
            },
          );
          if (!DebugMode.enabled) gui.hide();
        });
      } else if (gui) {
        if (on) gui.show();
        else gui.hide();
      }
    });

    // 控制台调试句柄
    (window as unknown as Record<string, unknown>).__game = this;
    (window as unknown as Record<string, unknown>).__story = {
      get phase() { return GameSession.load().phase; },
      reset: () => this.session.reset(),
      warp: (map: string, x: number, y: number, facing = 'down') =>
        this.debugWarpTo(map, x, y, facing as 'down' | 'up' | 'left' | 'right'),
    };

    // 进入游戏前完成解码与排程；若浏览器禁止自动播放，首次交互会从 intro 开始解锁。
    await bgmReady;
  }

  /** 按 id 装配（或取缓存）一张地图的场景内容。 */
  private async loadWorld(id: string): Promise<World> {
    const cached = this.worlds.get(id);
    if (cached) return cached;

    const map = getMap(id);
    const collision = new CollisionMap(map);
    const root = new THREE.Group();
    root.name = `world-${id}`;
    let update: World['update'];
    let interaction: WorldInteraction | undefined;

    if (map.interior) {
      const [interior, npcs] = await Promise.all([
        buildInterior(map),
        buildNpcs(map, collision, () => this.session.phase),
      ]);
      const lights = createLights(map);
      // 室内使用明亮的暖日光与柔和天光打底；局部窗光仍负责塑形，
      // 同时保留方向光投影，避免提亮后家具和墙角失去层次。
      lights.sun.color.setHex(0xffdfb0);
      lights.sun.intensity = 1.08;
      lights.sky.color.setHex(0xc8dce8);
      lights.sky.groundColor.setHex(0x7a6552);
      lights.sky.intensity = 1.28;
      root.add(interior, npcs.group, lights.group);
      const updateInteriorEffects = interior.userData.updateEffects as
        ((elapsed: number) => void) | undefined;
      update = (elapsed, dt, yaw, px, py) => {
        updateInteriorEffects?.(elapsed);
        npcs.update(dt, yaw, px, py);
      };
      interaction = npcs;
    } else {
      const [ground, props, npcs] = await Promise.all([
        buildGround(map),
        buildProps(map),
        buildNpcs(map, collision, () => this.session.phase),
      ]);
      const lights = createLights(map);
      const fireflies = new Fireflies(map, this.renderer.getPixelRatio());
      const shafts = new LightShafts(map);
      root.add(
        ground, props.group, npcs.group, lights.group,
        fireflies.points, shafts.group,
      );
      // 昼夜循环只在室外推进；进屋期间时间暂停，出屋继续。
      const dayNight = new DayNight(lights, this.scene, fireflies, shafts);
      this.dayNight ??= dayNight;
      update = (elapsed, dt, yaw, px, py) => {
        props.update(elapsed, yaw);
        npcs.update(dt, yaw, px, py);
        fireflies.update(elapsed);
        shafts.update(elapsed);
        dayNight.update(dt);
      };
      interaction = npcs;
    }

    const world: World = { map, root, collision, update, interaction };
    this.worlds.set(id, world);
    return world;
  }

  /** 主角抵达新格时依次检查 warp 与剧情踩格触发器。 */
  private checkTileEvents(): void {
    if (this.warping || this.storyBusy) return;
    const { tileX, tileY } = this.player.movement;
    if (tileX === this.lastTileX && tileY === this.lastTileY) return;
    this.lastTileX = tileX;
    this.lastTileY = tileY;
    if (this.world.map.wildEncounters?.cells.some(([x, y]) => x === tileX && y === tileY)) {
      this.bgm.playSfx(SFX.grassStep, this.input.running ? 0.78 : 0.62);
    }
    const warp = this.world.map.warps?.find(
      (w) => w.x === tileX && w.y === tileY,
    );
    if (warp) {
      void this.execWarp(warp);
      return;
    }
    const trigger = this.world.map.stepTriggers?.find((candidate) =>
      candidate.x === tileX && candidate.y === tileY
      && (!candidate.phases || candidate.phases.includes(this.session.phase))
      && (!candidate.once || !this.firedTriggers.has(candidate.id)),
    );
    if (trigger) {
      if (trigger.once) this.firedTriggers.add(trigger.id);
      void this.runStepTrigger(trigger.id);
      return;
    }
    if (this.session.phase !== 'free_roam' || this.session.party.length === 0) return;
    const encounter = this.wildEncounters.tryEncounter(
      this.world.map.wildEncounters, tileX, tileY,
    );
    if (encounter) void this.runWildEncounter(encounter);
  }

  private async runWildEncounter(encounter: WildEncounter): Promise<void> {
    if (this.storyBusy) return;
    const partner = this.session.party.find((pokemon) => pokemon.hp > 0);
    if (!partner) return;
    this.storyBusy = true;
    this.rememberPosition();
    try {
      const enemy = createPokemon(encounter.species, encounter.level);
      const result = await this.runBattle(partner, enemy, {
        canRun: true,
        canCapture: true,
        party: this.session.party,
        storage: this.session.storage,
        inventory: this.session.inventory,
      });
      if (result === 'defeat') {
        this.session.party.forEach((pokemon) => { pokemon.hp = pokemon.maxHp; });
        await this.dialogue.showAsync('提示', [
          `你带着${partner.nickname}退到了安全的地方，它的体力恢复了。`,
        ]);
      }
    } finally {
      this.storyBusy = false;
      this.rememberPosition();
    }
  }

  private async execWarp(warp: MapWarp): Promise<void> {
    this.setCameraMode(false);
    this.warping = true;
    const destinationMap = getMap(warp.dest);
    if (!this.world.map.interior && destinationMap.interior) {
      this.bgm.playSfx(SFX.doorEnter, 0.72);
    } else if (this.world.map.interior && !destinationMap.interior) {
      this.bgm.playSfx(SFX.doorExit, 0.72);
    }
    await this.fadeTo(1);

    const world = await this.loadWorld(warp.dest);
    this.scene.remove(this.world.root);
    this.scene.add(world.root);
    this.world = world;
    world.interaction?.refresh();
    // 室内用固定暗背景；室外交回 DayNight 每帧驱动
    this.scene.background = new THREE.Color(
      world.map.background ?? CONFIG.clearColor,
    );

    const spawn = { x: warp.destX, y: warp.destY, facing: warp.destFacing };
    this.player.warpTo(world.collision, spawn);
    this.lastTileX = spawn.x;
    this.lastTileY = spawn.y;
    this.rig.setMap(world.map);
    this.rig.snapTo(this.player.mesh.position.x, this.player.mesh.position.z);

    await this.fadeTo(0);
    this.warping = false;
    this.rememberPosition();
    void this.runMapEntryStory();
  }

  private fadeTo(opacity: number): Promise<void> {
    this.fade.style.opacity = String(opacity);
    return new Promise((resolve) => setTimeout(resolve, 240));
  }

  private static createFadeOverlay(): HTMLDivElement {
    const el = document.createElement('div');
    el.style.cssText =
      'position:fixed;inset:0;background:#000;opacity:0;z-index:20;' +
      'pointer-events:none;transition:opacity 0.22s linear';
    document.body.appendChild(el);
    return el;
  }

  private static createCameraModeOverlay(): HTMLDivElement {
    if (!document.querySelector('#promo-camera-styles')) {
      const style = document.createElement('style');
      style.id = 'promo-camera-styles';
      style.textContent = `
        body.promo-camera-active .lil-gui.root,
        body.promo-camera-active .emerald-dialogue,
        body.promo-camera-active .choice-overlay,
        body.promo-camera-active .text-entry-overlay { display:none!important }
      `;
      document.head.appendChild(style);
    }
    const el = document.createElement('div');
    el.setAttribute('aria-live', 'polite');
    el.style.cssText =
      'position:fixed;inset:0;z-index:18;pointer-events:none;display:none;' +
      'border-top:clamp(24px,5vh,54px) solid rgba(5,9,14,.88);' +
      'border-bottom:clamp(24px,5vh,54px) solid rgba(5,9,14,.88);box-sizing:border-box';
    document.body.appendChild(el);
    return el;
  }

  private static createPromoBattleHud(): HTMLDivElement {
    if (!document.querySelector('#promo-battle-hud-styles')) {
      const style = document.createElement('style');
      style.id = 'promo-battle-hud-styles';
      style.textContent = `
        .promo-battle-hud{position:fixed;inset:0;z-index:30;display:none;pointer-events:none;
          color:#f6fff8;font:700 18px/1.2 ui-monospace,monospace;text-shadow:2px 2px #172221}
        .promo-battle-status{position:absolute;width:min(31vw,390px);min-width:280px;padding:12px 16px;
          box-sizing:border-box;border:8px solid transparent;border-image:url("assets/battle/ui/frame.png") 6 fill/8px stretch;
          background:linear-gradient(135deg,rgba(18,34,34,.94),rgba(43,55,49,.92));box-shadow:10px 12px 0 rgba(5,17,14,.42)}
        .promo-battle-status[data-side="player"]{left:6vw;top:27vh}
        .promo-battle-status[data-side="enemy"]{right:6vw;top:8vh}
        .promo-battle-name{display:flex;justify-content:space-between;gap:18px}
        .promo-battle-hp-row{display:flex;align-items:center;gap:9px;margin-top:9px;font-size:13px;color:#74dea5}
        .promo-battle-hp{flex:1;height:12px;padding:2px;background:#101b19;border:2px solid #819187;box-shadow:inset 2px 2px #07100f}
        .promo-battle-hp i{display:block;width:100%;height:100%;background:#52d16f;transition:width .68s steps(12),background .15s}
        .promo-battle-hp i[data-state="warning"]{background:#f1c746}.promo-battle-hp i[data-state="danger"]{background:#ef5a4e}
        .promo-battle-message{position:absolute;left:50%;bottom:5vh;transform:translateX(-50%);width:min(72vw,900px);
          min-height:76px;padding:18px 24px;box-sizing:border-box;border:8px solid transparent;
          border-image:url("assets/battle/ui/frame.png") 6 fill/8px stretch;background:rgba(13,28,28,.95);
          box-shadow:12px 14px 0 rgba(2,12,9,.38);font-size:20px}
      `;
      document.head.appendChild(style);
    }
    const root = document.createElement('div');
    root.className = 'promo-battle-hud';
    root.innerHTML = `
      <div class="promo-battle-status" data-side="enemy">
        <div class="promo-battle-name"><span>蛇纹熊</span><span>Lv.70</span></div>
        <div class="promo-battle-hp-row"><b>HP</b><div class="promo-battle-hp"><i></i></div></div>
      </div>
      <div class="promo-battle-status" data-side="player">
        <div class="promo-battle-name"><span>木守宫</span><span>Lv.50</span></div>
        <div class="promo-battle-hp-row"><b>HP</b><div class="promo-battle-hp"><i></i></div></div>
      </div>
      <div class="promo-battle-message"></div>`;
    document.body.appendChild(root);
    return root;
  }

  private showPromoBattleHud(visible: boolean): void {
    this.promoBattleHud.style.display = visible ? 'block' : 'none';
    if (visible) {
      this.setPromoBattleHp('enemy', 1);
      this.setPromoBattleHp('player', 1);
    }
  }

  private setPromoBattleMessage(message: string): void {
    const element = this.promoBattleHud.querySelector<HTMLElement>('.promo-battle-message');
    if (element) element.textContent = message;
  }

  private setPromoBattleHp(side: 'enemy' | 'player', ratio: number): void {
    const bar = this.promoBattleHud.querySelector<HTMLElement>(
      `.promo-battle-status[data-side="${side}"] .promo-battle-hp i`,
    );
    if (!bar) return;
    const value = THREE.MathUtils.clamp(ratio, 0, 1);
    bar.style.width = `${value * 100}%`;
    bar.dataset.state = value <= 0.2 ? 'danger' : value <= 0.5 ? 'warning' : 'healthy';
  }

  private get cameraModeActive(): boolean {
    return this.promo?.active === true || this.cameraModeStarting;
  }

  private setCameraMode(active: boolean): void {
    if (active === this.cameraModeActive) return;
    if (active) void this.startPromoCameraMode();
    else this.stopPromoCameraMode();
  }

  private async startPromoCameraMode(): Promise<void> {
    if (this.cameraModeStarting || this.promo?.active || this.warping || this.battleStage) return;
    this.cameraModeStarting = true;
    const token = ++this.promoToken;
    try {
      const promoWorld = await this.loadWorld('littleroot');
      this.cinematicPlayer ??= await Player.create(this.input, promoWorld.collision, promoWorld.map);
      if (token !== this.promoToken) return;
      const state: PromoState = {
        token,
        active: true,
        world: promoWorld,
        originalWorld: this.world,
        originalBackground: this.scene.background,
        originalPlayerVisible: this.player.mesh.visible,
        originalDayTime: this.dayNight?.time,
        originalDayRunning: this.dayNight?.running,
        player: this.cinematicPlayer,
        elapsed: 0,
      };
      this.promo = state;
      if (promoWorld !== this.world) {
        this.scene.remove(this.world.root);
        this.scene.add(promoWorld.root);
      }
      promoWorld.root.visible = true;
      const promoSpawn = promoWorld === this.world
        ? {
          x: this.player.movement.tileX,
          y: this.player.movement.tileY,
          facing: this.player.movement.facing,
        }
        : promoWorld.map.spawn;
      state.player.warpTo(promoWorld.collision, promoSpawn);
      state.player.face(promoSpawn.facing, this.rig.yaw);
      state.player.mesh.visible = true;
      this.scene.add(state.player.mesh);
      // 用同位置替身接管画面后再隐藏真实玩家，视觉上不会丢失角色。
      this.player.mesh.visible = false;
      if (this.dayNight) {
        this.dayNight.running = false;
        this.dayNight.time = 0;
        this.dayNight.apply();
      }
      // 每次宣传片都从大地图 intro 起拍，保证昼夜长镜头的节奏可重复。
      void this.bgm.playOverworldMusic().catch(() => {});
      this.rig.startTour(promoWorld.map);
      this.showPromoChrome(true);
      void this.runPromoTimeline(state);
    } finally {
      this.cameraModeStarting = false;
      this.notifyCameraMode();
    }
  }

  private async runPromoTimeline(state: PromoState): Promise<void> {
    try {
      // 战斗资源从宣传片第一帧就并行预载；真正隐藏大地图仍由黑幕 gate 控制。
      let openBattleGate!: () => void;
      let battleGateOpened = false;
      const battleGate = new Promise<void>((resolve) => { openBattleGate = resolve; });
      state.mountBattle = () => {
        if (battleGateOpened) return;
        battleGateOpened = true;
        openBattleGate();
      };
      const arena = selectBattleArena(
        state.world.map, state.world.collision,
        new THREE.Vector3(13.5, 0, 31.25), 'forest',
      );
      const stagePromise = BattleStage.create({
        scene: this.scene,
        camera: this.rig.camera,
        worldRoot: state.world.root,
        playerMesh: state.player.mesh,
        arena,
        postfx: this.postfx,
      }, createPokemon('treecko', 50), createPokemon('zigzagoon', 70), battleGate);
      void stagePromise.then((stage) => {
        if (state.active) return;
        stage.dispose();
        this.restorePromoState(state);
      }).catch(() => undefined);

      // 首三秒从玩家原机位缓慢并轨，随后一镜到底推进并连续改变昼夜。
      await this.waitForPromoElapsed(state, 13.8);
      if (!state.active) return;

      // 镜头收紧到草丛时，使用独立演出角色自动巡走，不改动真实玩家状态。
      state.player.warpTo(state.world.collision, { x: 12, y: 30, facing: 'right' });
      state.player.mesh.visible = true;
      void state.player.walkScripted([
        'right', 'right', 'down', 'left', 'left', 'down',
        'right', 'right', 'up', 'left', 'left', 'up',
      ]).catch(() => undefined);
      void (async () => {
        for (let step = 0; step < 5 && state.active; step++) {
          this.bgm.playSfx(SFX.grassStep, 0.62);
          await this.waitPromo(state, 450);
        }
      })();
      // 玩家仍在搜寻草丛、行走动画尚未结束时触发遭遇。
      await this.waitForPromoElapsed(state, state.elapsed + 2.2);
      if (!state.active) return;

      // 只冻结当前草丛特写，不恢复进入宣传片前的远机位。
      this.rig.pauseTour();
      // 遭遇闪光与战斗音乐同时起拍：先播 2.487s intro，再无缝进入 loop。
      void this.bgm.playWildBattleMusic().catch(() => {});
      const transition = new BattleTransition(detectBattleVisualQuality(), 'promo');
      state.transition = transition;
      await transition.coverScreen();
      state.mountBattle();
      const stage = await stagePromise;
      state.stage = stage;
      if (!state.active) {
        stage.dispose();
        this.restorePromoState(state);
        return;
      }
      this.battleStage = stage;
      this.showPromoBattleHud(true);
      this.setPromoBattleMessage('野生的蛇纹熊出现了！');
      void transition.reveal();
      await stage.playEntrance();
      if (!state.active) return;
      await this.waitPromo(state, 420);
      this.setPromoBattleMessage('蛇纹熊发动了猛烈攻击！');
      const enemyAttack = stage.attack('enemy', 'player', 'leer');
      await this.waitPromo(state, 245);
      const playerHit = stage.hit('player');
      await Promise.all([enemyAttack, playerHit]);
      if (!state.active) return;
      // 蛇纹熊一击将木守宫压到红血，血条动画落定后再鸣响低血量警报。
      this.setPromoBattleHp('player', 0.08);
      await this.waitPromo(state, 760);
      this.bgm.playSfx(SFX.lowHp, 0.76);
      this.setPromoBattleMessage('木守宫的体力所剩无几！');
      await this.waitPromo(state, 620);
      this.setPromoBattleMessage('木守宫使出了拍击！');
      const counterAttack = stage.attack('player', 'enemy', 'pound');
      await this.waitPromo(state, 245);
      const enemyHit = stage.hit('enemy');
      await Promise.all([counterAttack, enemyHit]);
      if (!state.active) return;
      // 反击只削到黄血，给捕获高潮留下清晰的状态依据。
      this.setPromoBattleHp('enemy', 0.42);
      await this.waitPromo(state, 760);
      this.setPromoBattleMessage('使用了精灵球！');
      await this.waitPromo(state, 420);
      // 最终高潮：真实抛球、吸入、三次晃动并成功捕获蛇纹熊。
      await stage.captureAttempt(3, true, 0xe24a4a, true, true);
      if (!state.active) return;
      this.setPromoBattleMessage('太好了！成功捕获了蛇纹熊！');
      // 5.793s 捕获音乐完整承接确认音效，末尾自然淡黑，不显示文字。
      void this.bgm.playCaughtMusic().catch(() => {});
      await this.waitPromo(state, 5200);
      this.showPromoBattleHud(false);
      this.fade.style.transition = 'opacity .65s ease';
      this.fade.style.opacity = '1';
      await this.waitPromo(state, 700);
      // 留一段稳定黑场作为成片尾帧，避免画面在刚变黑时立即跳回游戏。
      await this.waitPromo(state, 1400);
    } catch (error) {
      if (state.active) console.error('宣传片播放失败', error);
    } finally {
      if (state.active) this.stopPromoCameraMode();
    }
  }

  private waitPromo(state: PromoState, milliseconds: number): Promise<void> {
    if (!state.active) return Promise.resolve();
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  private waitForPromoElapsed(state: PromoState, targetSeconds: number): Promise<void> {
    return new Promise((resolve) => {
      const poll = () => {
        if (!state.active || state.elapsed >= targetSeconds) resolve();
        else requestAnimationFrame(poll);
      };
      poll();
    });
  }

  private stopPromoCameraMode(): void {
    const state = this.promo;
    this.promoToken++;
    this.cameraModeStarting = false;
    if (!state) {
      this.notifyCameraMode();
      return;
    }
    state.active = false;
    state.transition?.dispose();
    state.mountBattle?.();
    state.stage?.dispose();
    if (this.battleStage === state.stage) this.battleStage = undefined;
    this.showPromoBattleHud(false);
    this.setPromoBattleMessage('');
    this.rig.stopTour();
    this.restorePromoState(state);
    this.promo = undefined;
    this.showPromoChrome(false);
    this.fade.style.opacity = '0';
    window.setTimeout(() => { this.fade.style.transition = 'opacity .22s linear'; }, 700);
    void this.bgm.playOverworldMusic().catch(() => {});
    this.notifyCameraMode();
  }

  private restorePromoState(state: PromoState): void {
    if (state.world !== state.originalWorld) {
      this.scene.remove(state.world.root);
      this.scene.add(state.originalWorld.root);
    }
    state.originalWorld.root.visible = true;
    this.player.mesh.visible = state.originalPlayerVisible;
    state.player.mesh.visible = false;
    this.scene.remove(state.player.mesh);
    if (this.dayNight && state.originalDayTime !== undefined) {
      this.dayNight.time = state.originalDayTime;
      this.dayNight.running = state.originalDayRunning ?? true;
      this.dayNight.apply();
    }
    this.scene.background = state.originalBackground;
  }

  private showPromoChrome(visible: boolean): void {
    this.cameraModeOverlay.style.display = visible ? 'block' : 'none';
    document.body.classList.toggle('promo-camera-active', visible);
    this.objective.setVisible(DebugMode.enabled && !visible);
    this.rig.setInteractive(DebugMode.enabled && !visible);
    this.notifyCameraMode();
  }

  private notifyCameraMode(): void {
    for (const listener of this.cameraModeListeners) listener(this.cameraModeActive);
  }

  private handleAction(): void {
    if (!this.input.consumeAction()) return;
    if (this.dialogue.active) {
      this.dialogue.advance();
      return;
    }
    if (this.warping || this.storyBusy || this.player.movement.moving) return;

    const { tileX, tileY, facing } = this.player.movement;
    const { dx, dy } = DIR_VECTORS[facing];
    const targetX = tileX + dx;
    const targetY = tileY + dy;
    const mapInteraction = this.world.map.interactions?.find((candidate) =>
      candidate.x === targetX && candidate.y === targetY
      && (!candidate.phases || candidate.phases.includes(this.session.phase)),
    );
    if (mapInteraction) {
      void this.runInteraction(mapInteraction.id);
      return;
    }
    const dialogue = this.world.interaction?.interactAt(targetX, targetY, tileX, tileY);
    if (!dialogue) return;
    if (dialogue.interactionId) {
      void this.runInteraction(dialogue.interactionId, dialogue);
      return;
    }
    this.dialogue.show(
      dialogue.speaker,
      dialogue.pages,
      () => this.world.interaction?.endInteraction(),
    );
  }

  private async runInteraction(
    id: string,
    actorDialogue?: { speaker: string; pages: string[] },
  ): Promise<void> {
    if (this.storyBusy) return;
    this.storyBusy = true;
    try {
      switch (id) {
        case 'mom':
          await this.dialogue.showAsync('妈妈',
            this.session.phase === 'watch_tv'
              ? ['电视节目快开始了，来这边看看吧。']
              : ['intro_mom', 'set_clock'].includes(this.session.phase)
                ? ['先去二楼设置墙上的时钟吧。']
                : ['路上小心，记得和宝可梦伙伴互相照顾。']);
          break;
        case 'set-clock': {
          await this.dialogue.showAsync('墙上的时钟', ['指针还停在搬家前的位置。']);
          const answer = await ChoiceMenu.choose<'set' | 'later'>('现在设置时钟吗？', [
            { label: '设置', value: 'set', description: '把时钟调整到现在。' },
            { label: '稍后', value: 'later', description: '暂时不改变。' },
          ]);
          if (answer === 'set') {
            await this.dialogue.showAsync('墙上的时钟', ['时钟开始规律地走动了。']);
            this.setPhase('watch_tv');
          }
          break;
        }
        case 'watch-tv':
          await this.dialogue.showAsync('妈妈', [
            '刚才电视里好像出现了爸爸，可惜节目已经结束了。',
            '对了，隔壁住着小田卷博士一家。去和新邻居打个招呼吧。',
          ]);
          this.setPhase('visit_rival');
          break;
        case 'rival-pokeball':
          await this.dialogue.showAsync('精灵球', ['这是邻居用来调查野生宝可梦的精灵球。']);
          break;
        case 'meet-rival':
          await this.dialogue.showAsync(actorDialogue?.speaker ?? '小遥', actorDialogue?.pages ?? [
            '你就是刚搬来的邻居？我正准备去野外调查。',
          ]);
          // 玩家通常站在小遥左侧；从下方绕行，避免离场演出第一步穿过玩家。
          // 若玩家从床边接近，则可直接沿房间北侧走到二楼楼梯口 (1, 1)。
          await this.world.interaction?.walkActor(
            'rival',
            this.player.movement.tileX === 4 && this.player.movement.tileY === 3
              ? ['down', 'left', 'left', 'left', 'left', 'up', 'up', 'up']
              : ['left', 'left', 'left', 'left', 'up', 'up'],
          );
          this.setPhase('go_route101');
          break;
        case 'route-gate-child':
          await this.dialogue.showAsync('女孩', this.session.phase === 'go_route101'
            ? ['北边传来了奇怪的叫声……你能去看看吗？']
            : this.session.phase === 'free_roam'
              ? ['和宝可梦一起旅行一定很开心。祝你好运！']
              : ['没有宝可梦的话，进入草丛很危险。']);
          break;
        case 'starter-bag':
          await this.chooseStarterAndBattle();
          break;
        case 'birch-lab':
          await this.dialogue.showAsync('小田卷博士', ['多观察、多战斗，你会逐渐理解宝可梦的心情。']);
          break;
        default:
          if (actorDialogue) await this.dialogue.showAsync(actorDialogue.speaker, actorDialogue.pages);
      }
    } finally {
      this.world.interaction?.endInteraction();
      this.storyBusy = false;
      this.rememberPosition();
    }
  }

  private async runStepTrigger(id: string): Promise<void> {
    if (this.storyBusy) return;
    this.storyBusy = true;
    try {
      if (id === 'route-blocked') {
        await this.runRouteBlockedSequence();
      } else if (id === 'start-birch-rescue') {
        this.bgm.playSfx(SFX.exclaim, 0.82);
        await this.dialogue.showAsync('远处的声音', ['救、救命！有人在那边吗？']);
        this.setPhase('rescue_birch');
        await this.dialogue.showAsync('女孩', ['是小田卷博士！快去调查他旁边的背包！']);
      }
    } finally {
      this.storyBusy = false;
      this.rememberPosition();
    }
  }

  private async runRouteBlockedSequence(): Promise<void> {
    const interaction = this.world.interaction;
    if (!interaction) throw new Error('当前地图没有 NPC 演出控制器');
    const enteredAtX = this.player.movement.tileX;
    const fromLeftLane = enteredAtX === 10;
    const girlApproach: Direction[] = fromLeftLane
      ? ['right', 'up', 'up']
      : ['up', 'right'];
    await interaction.walkActor('twin', girlApproach);

    interaction.faceActor('twin', fromLeftLane ? 'left' : 'up');
    this.player.face(fromLeftLane ? 'right' : 'down', this.rig.yaw);
    await this.dialogue.showAsync('女孩', [
      '没有宝可梦的话，独自进入草丛太危险了。先去和镇上的人打招呼吧。',
    ]);

    const girlReturn: Direction[] = fromLeftLane
      ? ['down', 'down', 'left']
      : ['left', 'down'];
    const playerReturn: Direction[] = fromLeftLane
      ? ['down', 'right', 'down']
      : ['down', 'down'];
    await Promise.all([
      interaction.walkActor('twin', girlReturn),
      this.player.walkScripted(playerReturn),
    ]);
    interaction.faceActor('twin', 'down');
    this.player.face('down', this.rig.yaw);
  }

  private async chooseStarterAndBattle(): Promise<void> {
    if (!['rescue_birch', 'choose_starter', 'first_battle'].includes(this.session.phase)) return;
    this.setPhase('choose_starter');
    await this.dialogue.showAsync('小田卷博士', ['背包里有三颗精灵球！请选择一只宝可梦帮帮我！']);
    const starter = await ChoiceMenu.choose<SpeciesId>('选择宝可梦', [
      { label: '木守宫', value: 'treecko', image: POKEMON_ATLAS.frontTexture, imageAtlas: { ...POKEMON_ATLAS, index: SPECIES.treecko.spriteIndex }, description: '森林蜥蜴宝可梦　草属性' },
      { label: '火稚鸡', value: 'torchic', image: POKEMON_ATLAS.frontTexture, imageAtlas: { ...POKEMON_ATLAS, index: SPECIES.torchic.spriteIndex }, description: '雏鸡宝可梦　火属性' },
      { label: '水跃鱼', value: 'mudkip', image: POKEMON_ATLAS.frontTexture, imageAtlas: { ...POKEMON_ATLAS, index: SPECIES.mudkip.spriteIndex }, description: '沼鱼宝可梦　水属性' },
    ]);
    const starterData = createPokemon(starter, 5);
    const enemy = createPokemon('zigzagoon', 2);
    this.setPhase('first_battle');
    let result = await this.runBattle(starterData, enemy);
    while (result === 'defeat') {
      starterData.hp = starterData.maxHp;
      enemy.hp = enemy.maxHp;
      await this.dialogue.showAsync('小田卷博士', ['别放弃！我已经让它恢复了体力，再试一次！']);
      result = await this.runBattle(starterData, enemy);
    }

    starterData.hp = starterData.maxHp;
    this.session.party = [starterData];
    this.setPhase('starter_received');
    await this.dialogue.showAsync('小田卷博士', ['太好了！多亏你，我才平安无事。跟我回研究所吧。']);
    await this.execWarp({
      x: 0, y: 0, dest: 'birch-lab', destX: 6, destY: 8, destFacing: 'up',
    });
    await this.finishStarterGift();
  }

  private async finishStarterGift(): Promise<void> {
    const starter = this.session.party[0];
    if (!starter) return;
    await this.dialogue.showAsync('小田卷博士', [
      `你和${starter.nickname}配合得非常好。`,
      '我希望你正式收下它，今后一起去观察更广阔的世界。',
    ]);
    const nickname = await ChoiceMenu.choose<'yes' | 'no'>('要给它取昵称吗？', [
      { label: '是', value: 'yes' }, { label: '否', value: 'no' },
    ]);
    if (nickname === 'yes') {
      const value = await TextEntry.ask(`给${SPECIES[starter.species].name}取昵称`, starter.nickname);
      if (value) starter.nickname = value;
    }
    await this.dialogue.showAsync('小田卷博士', ['从今天起，你们就是搭档了。去创造属于自己的冒险吧！']);
    this.setPhase('free_roam');
    this.rememberPosition();
  }

  /** 在当前世界中建立临时 3D 战斗舞台，并在退出时恢复探索表现。 */
  private async runBattle(
    player: ReturnType<typeof createPokemon>,
    enemy: ReturnType<typeof createPokemon>,
    options: BattleOptions = {},
  ): Promise<BattleResult> {
    void this.bgm.playWildBattleMusic().catch(() => {});
    const requestedArena = new URLSearchParams(location.search).get('battleArena');
    const arena = selectBattleArena(
      this.world.map,
      this.world.collision,
      this.player.mesh.position,
      isBattleArenaKind(requestedArena) ? requestedArena : undefined,
    );
    // 经典野战转场：三次闪屏 + 上下精灵球滚动横扫期间并行加载战斗资源，
    // 舞台以完整收黑为 mountGate，全黑后才替换场景；黑幕淡出与入场动画并行。
    const transition = new BattleTransition(detectBattleVisualQuality());
    try {
      const stage = await BattleStage.create({
        scene: this.scene,
        camera: this.rig.camera,
        worldRoot: this.world.root,
        playerMesh: this.player.mesh,
        arena,
        postfx: this.postfx,
      }, player, enemy, transition.coverScreen());
      this.battleStage = stage;
      try {
        void transition.reveal();
        return await new BattleScreen(stage).run(player, enemy, options);
      } finally {
        stage.dispose();
        if (this.battleStage === stage) this.battleStage = undefined;
        this.rig.snapTo(this.player.mesh.position.x, this.player.mesh.position.z);
      }
    } finally {
      transition.dispose();
      void this.bgm.playOverworldMusic().catch(() => {});
    }
  }

  private async runMapEntryStory(): Promise<void> {
    if (this.storyBusy) return;
    if (this.world.map.id === 'player-house-1f' && this.session.phase === 'intro_mom') {
      this.storyBusy = true;
      try {
        await this.dialogue.showAsync('妈妈', [
          '欢迎来到新家！搬家公司已经把大部分东西整理好了。',
          '先去楼上看看你的房间吧，顺便把墙上的时钟设置好。',
        ]);
        this.setPhase('set_clock');
      } finally {
        this.storyBusy = false;
      }
    } else if (this.world.map.id === 'birch-lab' && this.session.phase === 'starter_received') {
      this.storyBusy = true;
      try { await this.finishStarterGift(); } finally { this.storyBusy = false; }
    }
  }

  private setPhase(phase: StoryPhase): void {
    this.session.setPhase(phase);
    this.objective.set(phase);
    for (const world of this.worlds.values()) world.interaction?.refresh();
  }

  private placePlayer(x: number, y: number, facing: 'down' | 'up' | 'left' | 'right'): void {
    this.player.warpTo(this.world.collision, { x, y, facing });
    this.lastTileX = x;
    this.lastTileY = y;
    this.rig.snapTo(this.player.mesh.position.x, this.player.mesh.position.z);
  }

  private rememberPosition(): void {
    this.session.currentMap = this.world.map.id;
    this.session.player = {
      x: this.player.movement.tileX,
      y: this.player.movement.tileY,
      facing: this.player.movement.facing,
    };
    this.session.save();
  }

  /** 调试用：直接把主角放到指定 tile */
  teleport(x: number, y: number): void {
    this.placePlayer(x, y, this.player.movement.facing);
  }

  /** 调试与端到端验收：走真实淡入淡出和地图装配，只跳过无剧情的步行距离。 */
  debugWarpTo(
    map: string,
    x: number,
    y: number,
    facing: 'down' | 'up' | 'left' | 'right' = 'down',
  ): Promise<void> {
    return this.execWarp({ x: 0, y: 0, dest: map, destX: x, destY: y, destFacing: facing });
  }

  start(): void {
    this.renderer.setAnimationLoop(() => {
      const dt = Math.min(this.clock.getDelta(), 0.1);
      this.elapsed += dt;
      const cameraTouring = this.rig.updateTour(dt);
      const promoActive = this.cameraModeActive;
      const yaw = this.rig.yaw;
      const promo = this.promo?.active ? this.promo : undefined;
      if (promo && !this.battleStage) {
        promo.elapsed += dt;
        if (this.dayNight) {
          const raw = THREE.MathUtils.clamp((promo.elapsed - 5.5) / 8.3, 0, 1);
          const eased = raw * raw * (3 - 2 * raw);
          this.dayNight.time = eased * 0.5;
        }
        if (promo.player.scriptedMoving) promo.player.update(dt, yaw);
      }
      if (!promoActive) this.handleAction();
      this.dialogue.update(dt);
      if (!promoActive && !this.warping && !this.dialogue.active
        && (!this.storyBusy || this.player.scriptedMoving)) this.player.update(dt, yaw);
      if (!promoActive && !cameraTouring && !this.battleStage) {
        this.rig.follow(this.player.mesh.position.x, this.player.mesh.position.z, dt);
      }
      const renderedWorld = promo?.world ?? this.world;
      const focusPlayer = promo?.player ?? this.player;
      renderedWorld.update(
        this.elapsed, dt, yaw,
        focusPlayer.movement.worldX, focusPlayer.movement.worldY,
      );
      // 地图昼夜循环会写场景背景；战斗舞台最后更新以保持独立镜头与布景。
      if (this.battleStage) this.battleStage.update(dt);
      this.player.mesh.rotation.y = yaw;
      if (promo) promo.player.mesh.rotation.y = yaw;
      if (!promoActive) this.checkTileEvents();
      this.postfx.render(dt);
    });
    if (!this.entryStoryStarted) {
      this.entryStoryStarted = true;
      window.setTimeout(() => void this.runMapEntryStory(), 0);
    }
  }
}
