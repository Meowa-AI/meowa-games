import { battleEase } from './BattleTimeline';
import type { BattleVisualQuality } from './BattleQuality';

export const BATTLE_FLASH_COUNT = 3;
const FLASH_ON_MS = 78;
const FLASH_OFF_MS = 68;
const SWEEP_MS = 920;
const BLACK_HOLD_MS = 90;
const REVEAL_MS = 180;
const ROLL_PERIOD_MS = 420;

export const POKEBALL_ROLL_ASSET =
  '/assets/battle/transition/SPR_NewPokeball1.png';

export interface PokeballSweepLayout {
  ballSize: number;
  upperY: number;
  lowerY: number;
}

/** 两颗球分别位于上下半屏中央；尺寸取整，保证 32px 像素素材清晰放大。 */
export function createPokeballSweepLayout(
  width: number,
  height: number,
): PokeballSweepLayout {
  const desired = Math.max(64, Math.min(192, Math.min(width, height) * 0.24));
  const ballSize = Math.max(64, Math.round(desired / 32) * 32);
  return {
    ballSize,
    upperY: height * 0.25,
    lowerY: height * 0.75,
  };
}

/** 围绕 32×32 素材圆心连续旋转；下方球因移动方向相反而反转角速度。 */
export function getPokeballRollRotation(elapsedMs: number, reverse = false): number {
  const turns = Math.max(0, elapsedMs) / ROLL_PERIOD_MS;
  return turns * Math.PI * 2 * (reverse ? -1 : 1);
}

/**
 * 经典宝可梦野战转场：白闪三次 → 上下两颗精灵球反向滚动横扫并留下黑幕
 * → 全黑时装配战斗舞台 → 快速淡出黑幕。覆盖层始终在战斗 HUD 之上。
 */
export class BattleTransition {
  private readonly root = document.createElement('div');
  private readonly flash = document.createElement('div');
  private readonly canvas = document.createElement('canvas');
  private readonly context: CanvasRenderingContext2D | null;
  private readonly image = new Image();
  private viewWidth = 0;
  private viewHeight = 0;
  private disposed = false;

  constructor(
    private readonly quality: BattleVisualQuality,
    private readonly mode: 'standard' | 'promo' = 'standard',
  ) {
    this.image.src = POKEBALL_ROLL_ASSET;
    this.root.className = 'battle-transition-overlay';
    this.root.dataset.quality = quality;
    this.root.style.cssText =
      'position:fixed;inset:0;z-index:55;pointer-events:none;background:transparent;';
    this.canvas.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated;';
    this.flash.style.cssText =
      'position:absolute;inset:0;opacity:0;background:#fff;will-change:opacity;';
    this.root.append(this.canvas, this.flash);
    this.context = this.canvas.getContext('2d');
  }

  /** resolve 时画面已经全黑，BattleStage 才能安全替换探索场景。 */
  async coverScreen(): Promise<void> {
    document.body.appendChild(this.root);
    const imageReady = this.loadImage();
    const flashCount = BATTLE_FLASH_COUNT;
    const flashOn = this.mode === 'promo' ? 62 : FLASH_ON_MS;
    const flashOff = this.mode === 'promo' ? 42 : FLASH_OFF_MS;
    for (let index = 0; index < flashCount; index++) {
      this.setFlash(true);
      await this.wait(flashOn);
      this.setFlash(false);
      await this.wait(flashOff);
    }
    if (!this.context) {
      this.root.style.background = '#000';
      return;
    }
    await imageReady;
    await this.playPokeballSweep();
    await this.wait(this.mode === 'promo' ? 36 : BLACK_HOLD_MS);
  }

  /** 战斗场景已在黑幕后挂载，短促淡出避免出现额外的二次转场图形。 */
  async reveal(): Promise<void> {
    if (this.disposed) return;
    this.root.style.background = '#000';
    this.canvas.style.opacity = '0';
    await this.animate(this.mode === 'promo' ? 120 : REVEAL_MS, (progress) => {
      this.root.style.opacity = String(1 - battleEase.outCubic(progress));
    });
    this.dispose();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.remove();
  }

  private setFlash(on: boolean): void {
    this.flash.style.opacity = on ? '0.94' : '0';
  }

  private loadImage(): Promise<void> {
    if (this.image.complete && this.image.naturalWidth > 0) return Promise.resolve();
    return new Promise((resolve) => {
      this.image.addEventListener('load', () => resolve(), { once: true });
      // 素材异常时不能卡死战斗入口；横扫会退回到矢量精灵球。
      this.image.addEventListener('error', () => resolve(), { once: true });
    });
  }

  private playPokeballSweep(): Promise<void> {
    const context = this.context!;
    const dprLimit = this.quality === 'reduced' ? 1 : 2;
    const dpr = Math.min(window.devicePixelRatio || 1, dprLimit);
    this.viewWidth = window.innerWidth;
    this.viewHeight = window.innerHeight;
    this.canvas.width = Math.round(this.viewWidth * dpr);
    this.canvas.height = Math.round(this.viewHeight * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.imageSmoothingEnabled = false;
    const layout = createPokeballSweepLayout(this.viewWidth, this.viewHeight);

    return this.animate(this.mode === 'promo' ? 320 : SWEEP_MS, (progress, elapsedMs) => {
      const eased = battleEase.inOutCubic(progress);
      const radius = layout.ballSize / 2;
      const travel = this.viewWidth + layout.ballSize;
      const upperX = -radius + travel * eased;
      const lowerX = this.viewWidth + radius - travel * eased;

      context.clearRect(0, 0, this.viewWidth, this.viewHeight);
      context.fillStyle = '#000';
      context.fillRect(0, 0, Math.max(0, upperX), this.viewHeight / 2 + 1);
      const lowerStart = Math.min(this.viewWidth, lowerX);
      context.fillRect(
        lowerStart,
        this.viewHeight / 2,
        this.viewWidth - lowerStart,
        this.viewHeight / 2,
      );

      this.drawPokeball(
        upperX, layout.upperY, layout.ballSize,
        getPokeballRollRotation(elapsedMs),
      );
      this.drawPokeball(
        lowerX, layout.lowerY, layout.ballSize,
        getPokeballRollRotation(elapsedMs, true),
      );

      if (progress >= 1) context.fillRect(0, 0, this.viewWidth, this.viewHeight);
    });
  }

  private drawPokeball(x: number, y: number, size: number, rotation: number): void {
    const context = this.context!;
    context.save();
    context.translate(Math.round(x), Math.round(y));
    context.rotate(rotation);
    if (this.image.naturalWidth > 0) {
      context.drawImage(this.image, -size / 2, -size / 2, size, size);
      context.restore();
      return;
    }
    // 仅作网络/文件异常兜底；正常运行一定使用 NEW 的原始像素素材。
    context.beginPath();
    context.arc(0, 0, size / 2, 0, Math.PI * 2);
    context.clip();
    context.fillStyle = '#f22';
    context.fillRect(-size / 2, -size / 2, size, size / 2);
    context.fillStyle = '#fff';
    context.fillRect(-size / 2, 0, size, size / 2);
    context.fillStyle = '#111';
    context.fillRect(-size / 2, -size * 0.07, size, size * 0.14);
    context.restore();
  }

  /** 覆盖层独立于游戏循环，第二参数提供真实经过时间以驱动素材帧。 */
  private animate(
    duration: number,
    draw: (progress: number, elapsedMs: number) => void,
  ): Promise<void> {
    return new Promise((resolve) => {
      const start = performance.now();
      const frame = (now: number): void => {
        if (this.disposed) {
          resolve();
          return;
        }
        const elapsedMs = Math.max(0, now - start);
        const progress = Math.min(1, elapsedMs / duration);
        draw(progress, elapsedMs);
        if (progress < 1) requestAnimationFrame(frame);
        else resolve();
      };
      requestAnimationFrame(frame);
    });
  }

  private wait(milliseconds: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }
}
