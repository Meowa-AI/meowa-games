const OVERWORLD_MUSIC = {
  intro: 'assets/vfx/BGM/OST_NewLittleRoot_Intro.wav',
  loop: 'assets/vfx/BGM/OST_NewLittleRoot_Ioop.wav',
} as const;

const WILD_BATTLE_MUSIC = {
  intro: 'assets/audio/music/wild-battle-intro.wav',
  loop: 'assets/audio/music/wild-battle-loop.wav',
} as const;

const WILD_VICTORY_MUSIC = {
  intro: 'assets/audio/music/wild-victory-intro.wav',
  loop: 'assets/audio/music/wild-victory-loop.wav',
} as const;

const CAUGHT_MUSIC = 'assets/audio/music/caught.wav';

export const SFX = {
  uiHover: 'assets/audio/sfx/ui/hover.wav',
  uiSelect: 'assets/audio/sfx/ui/select.wav',
  menuOpen: 'assets/audio/sfx/ui/menu-open.wav',
  menuClose: 'assets/audio/sfx/ui/menu-close.wav',
  grassStep: 'assets/audio/sfx/world/grass-step.wav',
  doorEnter: 'assets/audio/sfx/world/door-enter.wav',
  doorExit: 'assets/audio/sfx/world/door-exit.wav',
  exclaim: 'assets/audio/sfx/world/exclaim.wav',
  throwBall: 'assets/audio/sfx/battle/throw-ball.wav',
  releasePokemon: 'assets/audio/sfx/battle/release-pokemon.wav',
  hitNormal: 'assets/audio/sfx/battle/hit-normal.wav',
  lowHp: 'assets/audio/sfx/battle/low-hp.wav',
  heal: 'assets/audio/sfx/battle/heal.wav',
  partySwitch: 'assets/audio/sfx/battle/party-switch.wav',
  flee: 'assets/audio/sfx/battle/flee.wav',
  lost: 'assets/audio/sfx/battle/lost.wav',
  ballHit: 'assets/audio/sfx/battle/ball-hit.wav',
  ballDrop: 'assets/audio/sfx/battle/ball-drop.wav',
  ballShake: 'assets/audio/sfx/battle/ball-shake.wav',
  ballClick: 'assets/audio/sfx/battle/ball-click.wav',
  ballAbsorb: 'assets/audio/sfx/battle/ball-absorb.wav',
  captureSuccess: 'assets/audio/sfx/battle/capture-success.wav',
  pound: 'assets/audio/sfx/moves/pound.wav',
  scratch: 'assets/audio/sfx/moves/scratch.wav',
  leer: 'assets/audio/sfx/moves/leer.wav',
} as const;

const MOVE_SFX: Readonly<Record<string, string | undefined>> = {
  pound: SFX.pound,
  scratch: SFX.scratch,
  leer: SFX.leer,
};

export function cryUrl(species: string): string {
  return `assets/audio/cries/${species}.wav`;
}

export function moveSfxUrl(moveId: string): string | undefined {
  return MOVE_SFX[moveId];
}

/**
 * 游戏统一 Web Audio 入口：音乐与短音效共享一个 AudioContext，既避免重复的
 * 自动播放解锁，也保证地图、战斗、胜利音乐之间只有一组 source 在运行。
 */
export class Bgm {
  private context: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private started = false;
  private musicRequest = 0;
  private musicSources: AudioBufferSourceNode[] = [];
  private readonly buffers = new Map<string, Promise<AudioBuffer>>();

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    const context = new AudioContext();
    this.context = context;
    this.musicGain = context.createGain();
    this.sfxGain = context.createGain();
    this.musicGain.gain.value = 0.72;
    this.sfxGain.gain.value = 0.86;
    this.musicGain.connect(context.destination);
    this.sfxGain.connect(context.destination);
    this.installAutoplayUnlock();

    try {
      await this.playMusic(OVERWORLD_MUSIC.intro, OVERWORLD_MUSIC.loop);
      // 不等待 resume：部分浏览器会让 Promise 一直挂起到用户首次交互。
      void this.tryResume();
    } catch (error) {
      this.started = false;
      this.buffers.clear();
      await context.close();
      this.context = null;
      this.musicGain = null;
      this.sfxGain = null;
      throw error;
    }
  }

  playOverworldMusic(): Promise<void> {
    return this.playMusic(OVERWORLD_MUSIC.intro, OVERWORLD_MUSIC.loop);
  }

  playWildBattleMusic(): Promise<void> {
    return this.playMusic(WILD_BATTLE_MUSIC.intro, WILD_BATTLE_MUSIC.loop);
  }

  playWildVictoryMusic(): Promise<void> {
    return this.playMusic(WILD_VICTORY_MUSIC.intro, WILD_VICTORY_MUSIC.loop);
  }

  playCaughtMusic(): Promise<void> {
    return this.playMusicOnce(CAUGHT_MUSIC);
  }

  playSfx(path: string, volume = 1): void {
    const context = this.context;
    const output = this.sfxGain;
    if (!context || !output) return;
    void this.loadBuffer(path).then((buffer) => {
      if (this.context !== context) return;
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      gain.gain.value = volume;
      source.connect(gain).connect(output);
      source.start();
    }).catch(() => {
      // 单个可选音效失败不应中断游戏流程。
    });
  }

  playCry(species: string): void {
    this.playSfx(cryUrl(species), 0.82);
  }

  playMove(moveId: string): void {
    const path = moveSfxUrl(moveId);
    if (path) this.playSfx(path, 0.88);
  }

  private async playMusic(introPath: string, loopPath: string): Promise<void> {
    const context = this.context;
    const output = this.musicGain;
    if (!context || !output) return;
    const request = ++this.musicRequest;
    const [intro, loop] = await Promise.all([
      this.loadBuffer(introPath),
      this.loadBuffer(loopPath),
    ]);
    if (request !== this.musicRequest || this.context !== context) return;

    this.stopMusicSources();
    const introSource = context.createBufferSource();
    introSource.buffer = intro;
    introSource.connect(output);

    const loopSource = context.createBufferSource();
    loopSource.buffer = loop;
    loopSource.loop = true;
    loopSource.loopStart = 0;
    loopSource.loopEnd = loop.duration;
    loopSource.connect(output);

    // 两个 source 预先放到同一时钟上，loop 在 intro 的最后一个采样后立即开始。
    const introStartTime = context.currentTime + 0.03;
    introSource.start(introStartTime);
    loopSource.start(introStartTime + intro.duration);
    this.musicSources = [introSource, loopSource];
  }

  private async playMusicOnce(path: string): Promise<void> {
    const context = this.context;
    const output = this.musicGain;
    if (!context || !output) return;
    const request = ++this.musicRequest;
    const buffer = await this.loadBuffer(path);
    if (request !== this.musicRequest || this.context !== context) return;
    this.stopMusicSources();
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(output);
    source.start(context.currentTime + 0.02);
    this.musicSources = [source];
  }

  private stopMusicSources(): void {
    for (const source of this.musicSources) {
      try { source.stop(); } catch { /* source 可能已自然结束 */ }
      source.disconnect();
    }
    this.musicSources = [];
  }

  private loadBuffer(path: string): Promise<AudioBuffer> {
    const cached = this.buffers.get(path);
    if (cached) return cached;
    const loading = this.fetchBuffer(path).catch((error) => {
      this.buffers.delete(path);
      throw error;
    });
    this.buffers.set(path, loading);
    return loading;
  }

  private async fetchBuffer(path: string): Promise<AudioBuffer> {
    const url = new URL(path, document.baseURI);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`音频加载失败：${response.status} ${url.pathname}`);
    }
    return this.context!.decodeAudioData(await response.arrayBuffer());
  }

  private installAutoplayUnlock(): void {
    const unlock = () => void this.tryResume();
    const events: (keyof WindowEventMap)[] = ['pointerdown', 'touchstart', 'keydown'];
    for (const event of events) window.addEventListener(event, unlock, { passive: true });

    this.context!.addEventListener('statechange', () => {
      if (this.context?.state !== 'running') return;
      for (const event of events) window.removeEventListener(event, unlock);
    });
  }

  private async tryResume(): Promise<void> {
    if (this.context?.state !== 'suspended') return;
    try {
      await this.context.resume();
    } catch {
      // 自动播放策略拒绝时保留监听器，等待下一次用户交互重试。
    }
  }
}

export const gameAudio = new Bgm();
