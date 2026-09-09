import * as THREE from 'three';
import { CONFIG } from '../config';
import type { MapData } from '../map/MapData';

/**
 * 体积光柱（god rays 的世界空间做法）：
 * 沿太阳入射方向倾斜的长条渐变面片，每束两片十字交叉（任意环绕角都可见），
 * 加色混合 + 缓慢呼吸。强度由 DayNight 驱动：白天最强、晨昏弱、夜晚消失。
 */

/** 程序生成光束渐变纹理：横向高斯软边，纵向上强下淡 */
function makeBeamTexture(): THREE.Texture {
  const W = 128;
  const H = 256;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    // 纵向：顶部快速淡入，向底部逐渐消散
    const v = y / H;
    const fadeIn = Math.min(1, v / 0.12);
    const fadeOut = 1 - THREE.MathUtils.smoothstep(v, 0.35, 1);
    for (let x = 0; x < W; x++) {
      const dx = (x - W / 2) / (W * 0.27);
      const a = Math.exp(-dx * dx) * fadeIn * fadeOut;
      const i = (y * W + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 244;
      img.data[i + 2] = 214;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class LightShafts {
  readonly group = new THREE.Group();
  private readonly mats: THREE.MeshBasicMaterial[] = [];
  private readonly phases: number[] = [];
  private fade = 1;

  constructor(map: MapData) {
    const S = CONFIG.fx.lightShafts;
    const tex = makeBeamTexture();
    // 光线行进方向 = 太阳方向取反（与阴影方向一致）
    const d = CONFIG.light.sunDirection;
    const beamUp = new THREE.Vector3(d.x, d.y, d.z).normalize();
    const baseQuat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      beamUp,
    );

    for (let i = 0; i < S.count; i++) {
      const width = 1.2 + Math.random() * 2.4;
      const len = 15 + Math.random() * 6;
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      this.mats.push(mat);
      this.phases.push(Math.random() * Math.PI * 2);

      // 光柱落点散布在镇内，束心沿光线方向抬升
      const ground = new THREE.Vector3(
        2 + Math.random() * (map.width - 4),
        0.2,
        2 + Math.random() * (map.height - 4),
      );
      const beam = new THREE.Group();
      beam.position.copy(ground).addScaledVector(beamUp, len * 0.45);
      beam.quaternion.copy(baseQuat);
      const geo = new THREE.PlaneGeometry(width, len);
      const p1 = new THREE.Mesh(geo, mat);
      const p2 = new THREE.Mesh(geo, mat);
      p2.rotation.y = Math.PI / 2;
      beam.add(p1, p2);
      this.group.add(beam);
    }
    this.group.name = 'light-shafts';
  }

  update(t: number): void {
    const S = CONFIG.fx.lightShafts;
    for (let i = 0; i < this.mats.length; i++) {
      const breathe = 0.7 + 0.3 * Math.sin(t * 0.35 + this.phases[i]);
      this.mats[i].opacity = S.opacity * this.fade * breathe;
    }
  }

  /** 昼夜驱动：0 = 隐藏（夜晚），1 = 全强（白天） */
  setFade(v: number): void {
    this.fade = v;
    this.group.visible = v > 0.01;
  }
}
