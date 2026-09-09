import * as THREE from 'three';
import { loadPixelTexture } from '../core/AssetLoader';
import type { MapData } from './MapData';
import { extrudePixelSpriteGeometry } from './PixelSpriteExtruder';

// 与 Meowa dual-grid 预览器一致：key 的四位依次为左上、左下、右上、右下。
const DUAL_GRID_ATLAS_BY_KEY: ReadonlyArray<readonly [number, number]> = [
  [0, 3], [3, 3], [0, 0], [3, 2],
  [0, 2], [1, 2], [2, 3], [3, 1],
  [1, 3], [0, 1], [3, 0], [2, 0],
  [1, 0], [2, 2], [1, 1], [2, 1],
];

function buildDualGridGeometry(
  columns: number,
  rows: number,
  filledCells: Array<[number, number]>,
): THREE.BufferGeometry {
  const filled = new Set(filledCells.map(([x, y]) => `${x},${y}`));
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const isFilled = (x: number, y: number) => filled.has(`${x},${y}`);

  for (let row = 0; row <= rows; row++) {
    for (let column = 0; column <= columns; column++) {
      let key = 0;
      if (isFilled(column - 1, row - 1)) key |= 1;
      if (isFilled(column - 1, row)) key |= 2;
      if (isFilled(column, row - 1)) key |= 4;
      if (isFilled(column, row)) key |= 8;
      if (key === 0) continue;

      const [atlasX, atlasY] = DUAL_GRID_ATLAS_BY_KEY[key];
      const u0 = atlasX / 4;
      const u1 = (atlasX + 1) / 4;
      const vTop = 1 - atlasY / 4;
      const vBottom = 1 - (atlasY + 1) / 4;
      const left = column - 0.5;
      const right = column + 0.5;
      const top = row - 0.5;
      const bottom = row + 0.5;
      const vertex = positions.length / 3;

      positions.push(
        left, 0, top,
        left, 0, bottom,
        right, 0, bottom,
        right, 0, top,
      );
      normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
      uvs.push(u0, vTop, u0, vBottom, u1, vBottom, u1, vTop);
      indices.push(vertex, vertex + 1, vertex + 2, vertex, vertex + 2, vertex + 3);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * 地面：整张地图纹理贴在 XZ 平面上。
 * tile (x, y) 的中心位于 world (x + 0.5, 0, y + 0.5)。
 */
export async function buildGround(map: MapData): Promise<THREE.Group> {
  const group = new THREE.Group();
  group.name = 'ground';

  const tex = await loadPixelTexture(map.groundTexture);
  const geo = new THREE.PlaneGeometry(map.width, map.height);
  const mat = new THREE.MeshLambertMaterial({ map: tex });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(map.width / 2, 0, map.height / 2);
  mesh.receiveShadow = true;
  group.add(mesh);

  if (map.dualGridTerrain) {
    const atlas = await loadPixelTexture(map.dualGridTerrain.texture);
    const terrain = new THREE.Mesh(
      buildDualGridGeometry(map.width, map.height, map.dualGridTerrain.filledCells),
      new THREE.MeshLambertMaterial({
        map: atlas,
        transparent: true,
        alphaTest: 0.01,
        depthWrite: false,
      }),
    );
    terrain.name = 'dual-grid-terrain';
    terrain.position.y = 0.002;
    terrain.receiveShadow = true;
    group.add(terrain);
  }

  for (const [index, spec] of (map.groundOverlays ?? []).entries()) {
    const overlayTexture = await loadPixelTexture(spec.texture);
    const height = spec.height ?? 0;
    const geometry = height > 0
      ? extrudePixelSpriteGeometry(overlayTexture, {
        width: map.width,
        height: map.height,
        depth: height,
        alphaTest: 0.01,
      })
      : new THREE.PlaneGeometry(map.width, map.height);
    const overlay = new THREE.Mesh(
      geometry,
      new THREE.MeshLambertMaterial({
        map: overlayTexture,
        transparent: true,
        alphaTest: 0.01,
        depthWrite: height > 0,
      }),
    );
    overlay.name = `ground-overlay-${index}`;
    overlay.rotation.x = -Math.PI / 2;
    overlay.position.set(
      map.width / 2,
      0.004 + height / 2 + index * 0.002,
      map.height / 2,
    );
    overlay.castShadow = height > 0;
    overlay.receiveShadow = true;
    group.add(overlay);
  }

  // 草地裙边：地图四周平铺草 tile，避免露出虚空背景
  const SKIRT = 30;
  const skirtTex = (await loadPixelTexture('assets/maps/grass-tile.png')).clone();
  skirtTex.wrapS = skirtTex.wrapT = THREE.RepeatWrapping;
  const size = { w: map.width + SKIRT * 2, h: map.height + SKIRT * 2 };
  skirtTex.repeat.set(size.w, size.h);
  const skirt = new THREE.Mesh(
    new THREE.PlaneGeometry(size.w, size.h),
    new THREE.MeshLambertMaterial({ map: skirtTex }),
  );
  skirt.rotation.x = -Math.PI / 2;
  skirt.position.set(map.width / 2, -0.01, map.height / 2);
  skirt.receiveShadow = true;
  group.add(skirt);

  return group;
}
