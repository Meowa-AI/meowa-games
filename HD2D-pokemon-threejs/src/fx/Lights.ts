import * as THREE from 'three';
import { CONFIG } from '../config';
import type { MapData } from '../map/MapData';

export interface Lights {
  group: THREE.Group;
  sun: THREE.DirectionalLight;
  sky: THREE.HemisphereLight;
}

/**
 * 暖色方向光（投影覆盖全镇）+ 冷色半球补光；
 * 颜色/强度由 DayNight 按时刻驱动。
 */
export function createLights(map: MapData): Lights {
  const g = new THREE.Group();
  g.name = 'lights';
  const L = CONFIG.light;

  const sun = new THREE.DirectionalLight(L.sunColor, L.sunIntensity);
  const dir = new THREE.Vector3(L.sunDirection.x, L.sunDirection.y, L.sunDirection.z)
    .normalize()
    .multiplyScalar(30);
  const center = new THREE.Vector3(map.width / 2, 0, map.height / 2);
  sun.position.copy(center).add(dir);
  sun.target.position.copy(center);
  sun.castShadow = true;
  sun.shadow.mapSize.set(L.shadowMapSize, L.shadowMapSize);
  const half = Math.max(map.width, map.height) / 2 + 4;
  sun.shadow.camera.left = -half;
  sun.shadow.camera.right = half;
  sun.shadow.camera.top = half;
  sun.shadow.camera.bottom = -half;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 80;
  sun.shadow.bias = L.shadowBias;
  sun.shadow.normalBias = L.shadowNormalBias;
  g.add(sun, sun.target);

  const sky = new THREE.HemisphereLight(L.ambientColor, 0x8a9a6a, L.ambientIntensity);
  g.add(sky);
  return { group: g, sun, sky };
}
