import * as THREE from 'three';
import { CONFIG } from '../config';
import type { MapData } from '../map/MapData';

/**
 * 萤火虫/花粉粒子：加色混合的漂浮光点，缓慢游移 + 明暗闪烁。
 * 颜色值 >1（HDR）以便被 Bloom 吃到形成光晕；位移全部在顶点着色器完成。
 */
export class Fireflies {
  readonly points: THREE.Points;
  private readonly uTime = { value: 0 };
  private readonly uFade = { value: 1 };

  constructor(map: MapData, pixelRatio: number) {
    const F = CONFIG.fx.fireflies;
    const positions = new Float32Array(F.count * 3);
    const seeds = new Float32Array(F.count * 4);
    for (let i = 0; i < F.count; i++) {
      positions[i * 3] = Math.random() * map.width;
      positions[i * 3 + 1] = F.minY + Math.random() * (F.maxY - F.minY);
      positions[i * 3 + 2] = Math.random() * map.height;
      seeds[i * 4] = Math.random() * Math.PI * 2;
      seeds[i * 4 + 1] = Math.random() * Math.PI * 2;
      seeds[i * 4 + 2] = Math.random() * Math.PI * 2;
      seeds[i * 4 + 3] = 0.6 + Math.random() * 0.8; // 尺寸/频率个体差异
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: this.uTime,
        uFade: this.uFade,
        uSize: { value: F.size * pixelRatio },
      },
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        uniform float uTime;
        uniform float uSize;
        varying float vTwinkle;
        void main() {
          vec3 p = position;
          p.x += sin(uTime * 0.31 + aSeed.x) * 0.9;
          p.y += sin(uTime * 0.53 + aSeed.y) * 0.4;
          p.z += cos(uTime * 0.24 + aSeed.z) * 0.9;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = uSize * aSeed.w * (14.0 / -mv.z);
          vTwinkle = 0.5 + 0.5 * sin(uTime * (1.2 + aSeed.w) + aSeed.x * 7.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uFade;
        varying float vTwinkle;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = smoothstep(1.0, 0.15, d) * (0.25 + 0.75 * vTwinkle) * uFade;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vec3(1.7, 1.3, 0.45) * a, a);
        }`,
    });

    this.points = new THREE.Points(geo, mat);
    this.points.name = 'fireflies';
    this.points.frustumCulled = false;
  }

  update(t: number): void {
    this.uTime.value = t;
  }

  /** 昼夜驱动：0 = 白天隐藏，1 = 夜晚全亮 */
  setFade(v: number): void {
    this.uFade.value = v;
  }
}
