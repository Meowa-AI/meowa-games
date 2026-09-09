import * as THREE from 'three';
import { CONFIG } from '../config';

/**
 * WebGLRenderer 统一配置。
 * 色调映射交给后期 composer（ToneMappingEffect），渲染器保持 NoToneMapping，
 * 避免双重映射；输出色彩空间 sRGB。
 */
export function createRenderer(): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    antialias: false, // 像素风不需要 MSAA，后期 SMAA 可选
    powerPreference: 'high-performance',
    stencil: false,
    depth: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(CONFIG.clearColor);
  document.body.appendChild(renderer.domElement);
  return renderer;
}
