import * as THREE from 'three';

/**
 * 植被顶点着色器补丁：风摆 + Y 轴公告牌。
 * 几何需带 aAnchor 属性（每株植物的根部世界坐标，见 PropsBuilder）：
 * - 公告牌：顶点绕各自锚点按相机 yaw 旋转，水平转视角时面片始终朝向相机；
 * - 风摆：按相对锚点的高度加水平正弦位移，相位混入锚点坐标，各株不同步。
 *
 * 重要：显示材质与阴影深度材质必须打同一套补丁——
 * 否则"可见的树"与"投影的树"朝向不一致，转动相机后本应藏在
 * 树后面的影子接触段会露出来，表现为树脚下的黑色轮廓块。
 */

function patchMaterial(
  material: THREE.Material,
  spriteHeight: number,
  uTime: { value: number },
  uYaw: { value: number },
): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.uniforms.uYaw = uYaw;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uTime;
         uniform float uYaw;
         attribute vec3 aAnchor;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         {
           vec3 rel = position - aAnchor;
           float cy = cos(uYaw);
           float sy = sin(uYaw);
           transformed = aAnchor + vec3(cy * rel.x + sy * rel.z, rel.y, -sy * rel.x + cy * rel.z);
           float h01 = clamp(rel.y / ${spriteHeight.toFixed(3)}, 0.0, 1.0);
           transformed.x += sin(uTime * 1.6 + aAnchor.x * 0.9 + aAnchor.z * 0.7) * h01 * h01 * 0.045;
         }`,
      );
  };
  // 缓存键须区分材质类型与高度常量（树/花、显示/深度的 GLSL 各不相同）
  material.customProgramCacheKey = () => `veg-${material.type}-${spriteHeight}`;
}

export function applyWindSway(
  material: THREE.MeshLambertMaterial,
  depthMaterial: THREE.MeshDepthMaterial,
  spriteHeight: number,
): (t: number, yaw: number) => void {
  const uTime = { value: 0 };
  const uYaw = { value: 0 };
  patchMaterial(material, spriteHeight, uTime, uYaw);
  patchMaterial(depthMaterial, spriteHeight, uTime, uYaw);
  return (t, yaw) => {
    uTime.value = t;
    uYaw.value = yaw;
  };
}
