import * as THREE from 'three';
import {
  BlendFunction,
  BloomEffect,
  BrightnessContrastEffect,
  EffectComposer,
  EffectPass,
  HueSaturationEffect,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';
import { CONFIG } from '../config';
import type { BattleVisualQuality } from '../battle/BattleQuality';
import { WeightedTiltShiftEffect } from './WeightedTiltShiftEffect';

interface PostFxSnapshot {
  enabled: boolean;
  clearArea: number;
  feather: number;
  offset: number;
  bloomIntensity: number;
  vignetteDarkness: number;
  vignetteOffset: number;
}

/**
 * HD-2D 后期栈：屏幕空间移轴（只糊画面上下边缘带，游戏区像素锐利）
 * + 泛光 + ACES 色调 + 暖色 grading + 暗角。P 键切换原始画面对比。
 */
export class PostFX {
  readonly composer: EffectComposer;
  readonly tiltShift: WeightedTiltShiftEffect;
  readonly bloom: BloomEffect;
  readonly vignette: VignetteEffect;
  enabled: boolean = CONFIG.fx.enabled;
  private battleSnapshot?: PostFxSnapshot;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
  ) {
    const F = CONFIG.fx;
    this.composer = new EffectComposer(renderer, {
      frameBufferType: THREE.HalfFloatType,
    });
    this.composer.addPass(new RenderPass(scene, camera));

    this.tiltShift = new WeightedTiltShiftEffect({
      clearArea: F.tiltShift.clearArea,
      feather: F.tiltShift.feather,
      offset: F.tiltShift.offset,
    });

    this.bloom = new BloomEffect({
      intensity: F.bloom.intensity,
      luminanceThreshold: F.bloom.luminanceThreshold,
      luminanceSmoothing: F.bloom.luminanceSmoothing,
      mipmapBlur: true,
    });

    const grade = new HueSaturationEffect({
      blendFunction: BlendFunction.NORMAL,
      saturation: F.hueSaturation.saturation,
    });
    const bc = new BrightnessContrastEffect({
      brightness: F.brightnessContrast.brightness,
      contrast: F.brightnessContrast.contrast,
    });
    const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
    this.vignette = new VignetteEffect({
      darkness: F.vignette.darkness,
      offset: F.vignette.offset,
    });

    this.composer.addPass(new EffectPass(camera, this.bloom, this.tiltShift));
    // 顺序关键：先 ACES 色调映射到显示域，再做饱和度/对比度/暗角。
    // 若调色在前，暗场景（黄昏→夜晚过渡）的深色会被推进 ACES 暗部死区，
    // 深红屋顶等直接压成纯黑块。
    this.composer.addPass(new EffectPass(camera, tone, grade, bc, this.vignette));

    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyP') this.enabled = !this.enabled;
    });
    window.addEventListener('resize', () => {
      this.composer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  render(dt: number): void {
    if (this.enabled) {
      this.composer.render(dt);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  /** 战斗构图使用更集中的焦平面；低配模式则直接绕过昂贵的合成器。 */
  enterBattleMode(quality: BattleVisualQuality): void {
    if (!this.battleSnapshot) {
      this.battleSnapshot = {
        enabled: this.enabled,
        clearArea: this.tiltShift.clearArea,
        feather: this.tiltShift.feather,
        offset: this.tiltShift.offset,
        bloomIntensity: this.bloom.intensity,
        vignetteDarkness: this.vignette.darkness,
        vignetteOffset: this.vignette.offset,
      };
    }
    if (quality === 'reduced') {
      this.enabled = false;
      return;
    }
    this.enabled = true;
    this.tiltShift.clearArea = 0.46;
    this.tiltShift.feather = 0.34;
    this.tiltShift.offset = 0.02;
    this.bloom.intensity = 0.42;
    this.vignette.darkness = 0.5;
    this.vignette.offset = 0.24;
  }

  exitBattleMode(): void {
    const snapshot = this.battleSnapshot;
    if (!snapshot) return;
    this.enabled = snapshot.enabled;
    this.tiltShift.clearArea = snapshot.clearArea;
    this.tiltShift.feather = snapshot.feather;
    this.tiltShift.offset = snapshot.offset;
    this.bloom.intensity = snapshot.bloomIntensity;
    this.vignette.darkness = snapshot.vignetteDarkness;
    this.vignette.offset = snapshot.vignetteOffset;
    this.battleSnapshot = undefined;
  }
}
