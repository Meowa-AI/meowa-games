import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { loadPixelTexture } from '../core/AssetLoader';
import { CONFIG } from '../config';
import { applyWindSway } from '../fx/WindSway';
import {
  buildHouse, buildLab, buildOldaleCenter, buildOldaleHouse, buildOldaleMart, buildSign,
} from './BuildingBuilder';
import type { MapData, PropKind } from './MapData';

interface SpriteSheetAnimation {
  columns: number;
  rows: number;
  frames: number;
  fps: number;
}

function showAtlasFrame(
  texture: THREE.Texture,
  animation: SpriteSheetAnimation,
  frame: number,
): void {
  const column = frame % animation.columns;
  const row = Math.floor(frame / animation.columns);
  texture.repeat.set(1 / animation.columns, 1 / animation.rows);
  texture.offset.set(
    column / animation.columns,
    (animation.rows - row - 1) / animation.rows,
  );
}

/**
 * 创建带剪影阴影的直立 cutout 材质对（树、人物等 2D 精灵用）。
 * customDepthMaterial 让阴影贴图按 alphaTest 裁剪，投出精灵轮廓而非整个矩形。
 */
export function makeCutoutMaterials(tex: THREE.Texture): {
  material: THREE.MeshLambertMaterial;
  depthMaterial: THREE.MeshDepthMaterial;
} {
  const material = new THREE.MeshLambertMaterial({
    map: tex,
    alphaTest: 0.5,
    transparent: false,
    side: THREE.DoubleSide,
  });
  const depthMaterial = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    map: tex,
    alphaTest: 0.5,
  });
  return { material, depthMaterial };
}

/**
 * 面片植被（树/花丛通用）：单张直立面片，经典 HD-2D 精灵风。
 * 同类全部合并为单个网格（一次 draw call）；风摆相位取世界坐标，
 * 合并后各株摆动仍不同步。按 tile 奇偶镜像部分个体打破重复感。
 */
async function buildCrossField(
  props: MapData['props'],
  kind: PropKind,
  textureUrl: string,
  animation?: SpriteSheetAnimation,
): Promise<{ mesh: THREE.Mesh; update: (t: number, yaw: number) => void }> {
  const tex = await loadPixelTexture(textureUrl);
  const img = tex.image as { width: number; height: number };
  const frameWidth = img.width / (animation?.columns ?? 1);
  const frameHeight = img.height / (animation?.rows ?? 1);
  const w = frameWidth / CONFIG.tilePixels;
  const h = frameHeight / CONFIG.tilePixels;
  if (animation) showAtlasFrame(tex, animation, 0);
  const { material, depthMaterial } = makeCutoutMaterials(tex);
  const updateWind = applyWindSway(material, depthMaterial, h);

  const ANGLES = [0];
  const geos: THREE.BufferGeometry[] = [];
  for (const prop of props) {
    if (prop.kind !== kind) continue;
    const cx = prop.x + prop.width / 2;
    const cz = prop.y + 1;
    const mirror = (prop.x + prop.y) % 4 >= 2;
    for (const angle of ANGLES) {
      const g = new THREE.PlaneGeometry(w, h);
      if (mirror) {
        const uv = g.getAttribute('uv') as THREE.BufferAttribute;
        for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
      }
      g.rotateY(angle);
      g.translate(cx, h / 2 + 0.01, cz);
      // 每株植物的根部锚点：公告牌旋转与风摆相位的基准（见 WindSway）
      const anchors = new Float32Array(g.getAttribute('position').count * 3);
      for (let i = 0; i < anchors.length; i += 3) {
        anchors[i] = cx;
        anchors[i + 1] = 0.01;
        anchors[i + 2] = cz;
      }
      g.setAttribute('aAnchor', new THREE.BufferAttribute(anchors, 3));
      geos.push(g);
    }
  }
  const merged = mergeGeometries(geos);
  geos.forEach((g) => g.dispose());
  const mesh = new THREE.Mesh(merged, material);
  mesh.customDepthMaterial = depthMaterial;
  mesh.castShadow = true;
  mesh.name = kind;
  let currentFrame = 0;
  return {
    mesh,
    update: (t, yaw) => {
      updateWind(t, yaw);
      if (!animation) return;
      const frame = Math.floor(t * animation.fps) % animation.frames;
      if (frame === currentFrame) return;
      currentFrame = frame;
      showAtlasFrame(tex, animation, frame);
    },
  };
}

/**
 * 可穿行高草：每格三张有纵深间距的相机公告牌，共享格子中心锚点。
 * shader 会连同层间偏移一起绕中心旋转，因此相机环绕时三层始终保持前中后视差；
 * alphaTest + 深度写入让草叶自然遮住角色下半身，而透明区域不参与遮挡。
 */
async function buildTallGrassField(
  props: MapData['props'],
): Promise<{ mesh: THREE.Mesh; update: (t: number, yaw: number) => void }> {
  const tex = await loadPixelTexture('assets/sprites/props/tall-grass.png');
  const width = 1.12;
  const height = 0.82;
  const { material, depthMaterial } = makeCutoutMaterials(tex);
  const update = applyWindSway(material, depthMaterial, height);
  const geos: THREE.BufferGeometry[] = [];
  const layers = [
    { depth: -0.26, offsetX: -0.08 },
    { depth: 0, offsetX: 0.07 },
    { depth: 0.26, offsetX: -0.02 },
  ];

  for (const prop of props) {
    if (prop.kind !== 'tallGrass') continue;
    const cx = prop.x + 0.5;
    const cz = prop.y + 0.5;
    for (let layer = 0; layer < layers.length; layer++) {
      const { depth, offsetX } = layers[layer];
      const g = new THREE.PlaneGeometry(width, height);
      if ((prop.x + prop.y + layer) % 2 === 1) {
        const uv = g.getAttribute('uv') as THREE.BufferAttribute;
        for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
      }
      g.translate(cx + offsetX, height / 2 + 0.01, cz + depth);

      // 三层共享格子根部锚点；公告牌旋转时层间偏移也随相机旋转。
      const anchors = new Float32Array(g.getAttribute('position').count * 3);
      for (let i = 0; i < anchors.length; i += 3) {
        anchors[i] = cx;
        anchors[i + 1] = 0.01;
        anchors[i + 2] = cz;
      }
      g.setAttribute('aAnchor', new THREE.BufferAttribute(anchors, 3));
      geos.push(g);
    }
  }

  const merged = mergeGeometries(geos);
  geos.forEach((g) => g.dispose());
  const mesh = new THREE.Mesh(merged, material);
  mesh.customDepthMaterial = depthMaterial;
  mesh.castShadow = true;
  mesh.name = 'tallGrass';
  return { mesh, update };
}

/**
 * 装配地图 props：
 * - 树/牌子等以占地最下行南缘为基线（world z = prop.y + 1）
 * - 建筑（民居/研究所）为 3D 体块，局部原点在正面底边中心
 */
export async function buildProps(
  map: MapData,
): Promise<{ group: THREE.Group; update: (t: number, yaw: number) => void }> {
  const group = new THREE.Group();
  group.name = 'props';

  const [trees, flowers, tallGrass] = await Promise.all([
    buildCrossField(map.props, 'tree', 'assets/sprites/props/tree.png'),
    buildCrossField(
      map.props,
      'flower',
      'assets/sprites/props/flower-idle-spritesheet.png',
      { columns: 3, rows: 3, frames: 8, fps: 2 },
    ),
    buildTallGrassField(map.props),
  ]);
  group.add(trees.mesh, flowers.mesh, tallGrass.mesh);

  const templates: Partial<Record<PropKind, THREE.Object3D>> = {
    house: await buildHouse(),
    lab: await buildLab(),
    oldaleHouse: await buildOldaleHouse(),
    oldaleMart: await buildOldaleMart(),
    oldaleCenter: await buildOldaleCenter(),
    sign: await buildSign(),
  };

  for (const prop of map.props) {
    if (prop.kind === 'tree' || prop.kind === 'flower' || prop.kind === 'tallGrass') continue;
    const obj = templates[prop.kind]!.clone();
    // 建筑正面原本恰好落在门格人物面片的 z 平面上；向建筑内部退约 1/3 像素，
    // 让玩家走上门格时拥有真实深度间隔，避免门贴图与人物发生 Z-fighting。
    const facadeGap = prop.kind === 'sign' ? 0 : 0.02;
    obj.position.set(prop.x + prop.width / 2, 0, prop.y + 1 - facadeGap);
    group.add(obj);
  }
  return {
    group,
    update: (t, yaw) => {
      trees.update(t, yaw);
      flowers.update(t, yaw);
      tallGrass.update(t, yaw);
    },
  };
}
