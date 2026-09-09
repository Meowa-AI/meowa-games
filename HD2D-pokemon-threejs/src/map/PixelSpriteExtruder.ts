import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface PixelSpriteExtrusionOptions {
  /** 挤出后在局部坐标中的宽度；默认 1。 */
  width?: number;
  /** 挤出后在局部坐标中的高度；默认按原图宽高比计算。 */
  height?: number;
  /** 沿局部 Z 轴挤出的总厚度。 */
  depth: number;
  /** 判定实体像素的 alpha 阈值，范围 0..1；默认 0.5。 */
  alphaTest?: number;
}

/**
 * 将带透明通道的像素纹理转换成封闭的 3D 几何体。
 *
 * 前后表面保留原纹理 UV；侧壁仅沿实体像素与透明像素的边界生成，
 * 并采样相邻实体像素的颜色。这样既保留像素轮廓，也避免堆叠大量透明面片。
 * 纹理图片必须允许当前页面通过 Canvas 读取像素（通常应为同源资源）。
 */
export function extrudePixelSpriteGeometry(
  texture: THREE.Texture,
  options: PixelSpriteExtrusionOptions,
): THREE.BufferGeometry {
  const image = texture.image as CanvasImageSource & { width: number; height: number };
  if (!image?.width || !image?.height) throw new Error('像素纹理尚未加载完成');

  const width = options.width ?? 1;
  const height = options.height ?? width * image.height / image.width;
  const depth = options.depth;
  const alphaThreshold = Math.round((options.alphaTest ?? 0.5) * 255);
  if (width <= 0 || height <= 0 || depth <= 0) throw new Error('像素挤出的宽、高和厚度必须大于 0');

  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('无法创建像素纹理读取画布');
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, image.width, image.height).data;
  const opaque = (x: number, y: number) =>
    x >= 0 && x < image.width && y >= 0 && y < image.height
      && pixels[(y * image.width + x) * 4 + 3] >= alphaThreshold;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const addSide = (corners: number[][], u: number, v: number) => {
    const base = positions.length / 3;
    for (const corner of corners) {
      positions.push(...corner);
      // 四个顶点固定采样边界内侧的实体像素，避免侧壁拉伸整张贴图。
      uvs.push(u, v);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  const halfDepth = depth / 2;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (!opaque(x, y)) continue;
      const left = (x / image.width - 0.5) * width;
      const right = ((x + 1) / image.width - 0.5) * width;
      const top = (0.5 - y / image.height) * height;
      const bottom = (0.5 - (y + 1) / image.height) * height;
      const u = (x + 0.5) / image.width;
      const v = 1 - (y + 0.5) / image.height;

      if (!opaque(x - 1, y)) addSide([
        [left, bottom, -halfDepth], [left, bottom, halfDepth],
        [left, top, halfDepth], [left, top, -halfDepth],
      ], u, v);
      if (!opaque(x + 1, y)) addSide([
        [right, bottom, halfDepth], [right, bottom, -halfDepth],
        [right, top, -halfDepth], [right, top, halfDepth],
      ], u, v);
      if (!opaque(x, y - 1)) addSide([
        [left, top, halfDepth], [right, top, halfDepth],
        [right, top, -halfDepth], [left, top, -halfDepth],
      ], u, v);
      if (!opaque(x, y + 1)) addSide([
        [left, bottom, -halfDepth], [right, bottom, -halfDepth],
        [right, bottom, halfDepth], [left, bottom, halfDepth],
      ], u, v);
    }
  }

  const sides = new THREE.BufferGeometry();
  sides.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  sides.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  sides.setIndex(indices);
  sides.computeVertexNormals();

  const front = new THREE.PlaneGeometry(width, height);
  front.translate(0, 0, halfDepth);
  const back = new THREE.PlaneGeometry(width, height);
  back.rotateY(Math.PI);
  back.translate(0, 0, -halfDepth);

  const parts = [front, back, sides];
  const geometry = mergeGeometries(parts);
  parts.forEach((part) => part.dispose());
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
