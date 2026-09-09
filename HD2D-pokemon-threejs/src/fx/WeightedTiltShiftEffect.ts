import * as THREE from 'three';
import { TiltShiftEffect } from 'postprocessing';

const fragmentShader = /* glsl */ `
  #ifdef FRAMEBUFFER_PRECISION_HIGH
    uniform mediump sampler2D map;
  #else
    uniform lowp sampler2D map;
  #endif

  uniform float blendFocusArea;
  uniform float blendFeather;
  uniform float blendOffset;
  varying vec2 vUv2;

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    float innerEdge = max(blendFocusArea - blendFeather, 0.0);
    float outerEdge = max(blendFocusArea, innerEdge + 0.0001);
    float distanceFromFocus = abs(vUv2.y - blendOffset);
    float blurWeight = smoothstep(innerEdge, outerEdge, distanceFromFocus);
    vec4 blurredColor = texture2D(map, uv);

    // 清晰区保持原图，外侧保持原 Kawase 模糊；只在羽化带内加权混合。
    outputColor = mix(inputColor, blurredColor, blurWeight);
  }
`;

/** 保留原移轴模糊通道，仅将最终硬切遮罩替换为连续权重。 */
export class WeightedTiltShiftEffect extends TiltShiftEffect {
  constructor(options: { clearArea: number; feather: number; offset: number }) {
    const focusArea = Math.min(options.clearArea + options.feather, 1);
    super({ focusArea, feather: options.feather, offset: options.offset });
    this.uniforms.set('blendFocusArea', new THREE.Uniform(focusArea));
    this.uniforms.set('blendFeather', new THREE.Uniform(options.feather));
    this.uniforms.set('blendOffset', new THREE.Uniform(options.offset));
    this.setFragmentShader(fragmentShader);
    this.syncBlurSourceMask();
  }

  /**
   * 底层 TiltShiftBlurPass 自带一层羽化。如果它与最终混合共用同一 feather，
   * 两条 smoothstep 曲线会叠乘，造成前段变化太弱、后段突然变糊。
   * 这里只给模糊源保留极窄的防接缝区，视觉上的完整过渡只由上面的
   * blurWeight 控制，因此 feather 才准确表示 0% 到 100% 模糊的距离。
   */
  private syncBlurSourceMask(): void {
    const clearArea = this.clearArea;
    const sourceFeather = Math.min(0.01, Math.max(1 - clearArea, 0));
    const blurMaterial = this.blurPass.blurMaterial as typeof this.blurPass.blurMaterial & {
      focusArea: number;
      feather: number;
    };
    blurMaterial.focusArea = clearArea + sourceFeather;
    blurMaterial.feather = sourceFeather;
  }

  override get focusArea(): number { return super.focusArea; }
  override set focusArea(value: number) {
    super.focusArea = value;
    const uniform = this.uniforms.get('blendFocusArea');
    if (uniform) uniform.value = value;
    if (this.blurPass) this.syncBlurSourceMask();
  }

  /** 中央完全清晰区域的宽度；调整时保持渐变带宽度不变。 */
  get clearArea(): number {
    return Math.max(this.focusArea - this.feather, 0);
  }

  set clearArea(value: number) {
    const clamped = THREE.MathUtils.clamp(value, 0, 1 - this.feather);
    this.focusArea = clamped + this.feather;
  }

  override get feather(): number { return super.feather; }
  override set feather(value: number) {
    const clearArea = this.clearArea;
    const clamped = THREE.MathUtils.clamp(value, 0, 1 - clearArea);
    super.feather = clamped;
    const uniform = this.uniforms.get('blendFeather');
    if (uniform) uniform.value = clamped;
    // focusArea 是渐变带的外边界；同步移动它，让中央清晰区保持不变。
    this.focusArea = clearArea + clamped;
  }

  override get offset(): number { return super.offset; }
  override set offset(value: number) {
    super.offset = value;
    const uniform = this.uniforms.get('blendOffset');
    if (uniform) uniform.value = value;
  }
}
