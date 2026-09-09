import * as THREE from 'three';
import { CONFIG } from '../config';
import { DebugMode } from '../core/DebugMode';
import { glowMaterials } from '../map/BuildingBuilder';
import type { Lights } from './Lights';
import type { LightShafts } from './LightShafts';
import type { Fireflies } from './Particles';

/**
 * 昼夜循环：t ∈ [0,1)，0 = 正午、0.25 = 黄昏、0.5 = 午夜、0.75 = 黎明。
 * 在四个关键帧之间平滑插值，驱动阳光、天空半球光、背景色、
 * 窗户自发光强度与萤火虫可见度。按 N 快进到下一时段。
 */

interface Keyframe {
  sunColor: number;
  sunIntensity: number;
  skyColor: number;
  skyIntensity: number;
  background: number;
  windowGlow: number;
  fireflies: number;
  shafts: number;
}

/** 正午 → 黄昏 → 午夜 → 黎明 */
const KEYFRAMES: Keyframe[] = [
  { sunColor: 0xfff2d8, sunIntensity: 2.6, skyColor: 0xbcd4ff, skyIntensity: 1.1,
    background: 0x87b5e0, windowGlow: 0.7, fireflies: 0.0, shafts: 1.0 },
  { sunColor: 0xff9a4a, sunIntensity: 1.3, skyColor: 0xa87888, skyIntensity: 0.75,
    background: 0xc98a5e, windowGlow: 2.2, fireflies: 0.65, shafts: 0.3 },
  { sunColor: 0x8aa8ff, sunIntensity: 0.35, skyColor: 0x3a4670, skyIntensity: 0.45,
    background: 0x0e1630, windowGlow: 3.2, fireflies: 1.0, shafts: 0.0 },
  { sunColor: 0xffc9a0, sunIntensity: 1.1, skyColor: 0x8a90b0, skyIntensity: 0.65,
    background: 0x9aa4c4, windowGlow: 1.4, fireflies: 0.35, shafts: 0.4 },
];

export class DayNight {
  /** 当前时刻（0..1），可被调参面板直接改写 */
  time: number = CONFIG.fx.dayNight.start;
  /** 是否自动流逝 */
  running = true;
  /** 时间流逝倍率；1 = CONFIG 中配置的默认昼夜循环速度 */
  timeScale = 1;
  /** 复现/调试用：正午↔午夜快速往返（约 6s 单程），B 键切换 */
  pingPong = false;
  private pingDir = 1;

  private readonly bg = new THREE.Color();
  private readonly colorA = new THREE.Color();
  private readonly colorB = new THREE.Color();

  constructor(
    private readonly lights: Lights,
    private readonly scene: THREE.Scene,
    private readonly fireflies: Fireflies,
    private readonly shafts: LightShafts,
  ) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyN') {
        // 快进到下一时段锚点（正午/黄昏/午夜/黎明）
        this.time = (Math.floor(this.time * 4 + 1) % 4) / 4;
        this.apply();
      }
      if (e.code === 'KeyB') this.pingPong = !this.pingPong;
    });
    this.buildHud();
    this.apply();
  }

  update(dt: number): void {
    if (this.pingPong) {
      // 正午(0) ↔ 午夜(0.5) 快速往返，便于复现过渡时刻的问题
      this.time += (this.pingDir * dt * this.timeScale) / 6 / 2;
      if (this.time >= 0.5) { this.time = 0.5; this.pingDir = -1; }
      if (this.time <= 0) { this.time = 0; this.pingDir = 1; }
    } else if (this.running) {
      this.time = (this.time + dt * this.timeScale / CONFIG.fx.dayNight.cycleSeconds) % 1;
    }
    this.apply();
    this.updateHud();
  }

  private hud?: HTMLDivElement;

  private buildHud(): void {
    this.hud = document.createElement('div');
    this.hud.style.cssText =
      'position:fixed;top:8px;left:8px;padding:4px 10px;z-index:10;' +
      'font:13px/1.6 monospace;color:#fff;background:rgba(0,0,0,.45);' +
      'border-radius:6px;pointer-events:none;white-space:pre';
    document.body.appendChild(this.hud);
    // 默认隐藏，仅 debug 模式（F9）显示
    DebugMode.onChange((on) => {
      this.hud!.style.display = on ? 'block' : 'none';
    });
  }

  private updateHud(): void {
    if (!this.hud) return;
    const names = ['正午→黄昏', '黄昏→午夜', '午夜→黎明', '黎明→正午'];
    const phase = names[Math.floor(this.time * 4) % 4];
    this.hud.textContent =
      `t=${this.time.toFixed(3)}  ${phase}  ${this.timeScale.toFixed(1)}x${this.pingPong ? '  [B:往返中]' : ''}`;
  }

  apply(): void {
    const seg = Math.floor(this.time * 4) % 4;
    const a = KEYFRAMES[seg];
    const b = KEYFRAMES[(seg + 1) % 4];
    // 段内进度做 smoothstep，让时段中心停留更久、过渡更柔
    const raw = this.time * 4 - seg;
    const k = raw * raw * (3 - 2 * raw);
    const lerp = (x: number, y: number) => x + (y - x) * k;
    const lerpColor = (target: THREE.Color, x: number, y: number) =>
      target.lerpColors(this.colorA.setHex(x), this.colorB.setHex(y), k);

    lerpColor(this.lights.sun.color, a.sunColor, b.sunColor);
    this.lights.sun.intensity = lerp(a.sunIntensity, b.sunIntensity);
    lerpColor(this.lights.sky.color, a.skyColor, b.skyColor);
    this.lights.sky.intensity = lerp(a.skyIntensity, b.skyIntensity);
    lerpColor(this.bg, a.background, b.background);
    this.scene.background = this.bg;

    const glow = lerp(a.windowGlow, b.windowGlow);
    for (const m of glowMaterials) m.emissiveIntensity = glow;
    this.fireflies.setFade(lerp(a.fireflies, b.fireflies));
    this.shafts.setFade(lerp(a.shafts, b.shafts));
  }
}
