import * as THREE from 'three';
import { loadPixelTexture } from '../core/AssetLoader';
import type {
  FurnitureBox, FurnitureCylinder, FurnitureDust, FurnitureLightPatch,
  FurnitureSprite, InteriorFurniture, MapData,
} from './MapData';

/**
 * 室内场景装配（HD-2D 立体版）：
 * - 墙体为带厚度的盒体：内侧贴图、顶部亮色收边、南端露出横截面
 * - 家具为 BoxGeometry 按面贴图（顶面/正面来自部件切图，侧面压暗复用）
 * - 纯色静态零件按材质/阴影类别实例化，同时保留逐零件命名节点供运行时审计
 * - 仅大轮廓投影；所有实体仍接收阴影，无 alphaTest 剪影的深度补丁
 */

/** BoxGeometry 材质槽位顺序：+x 东、-x 西、+y 顶、-y 底、+z 南、-z 北 */
const EAST = 0;
const WEST = 1;
const TOP = 2;
const SOUTH = 4;

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const lambertMaterialCache = new Map<number, THREE.MeshLambertMaterial>();
const basicMaterialCache = new Map<number, THREE.MeshBasicMaterial>();
const texturedMaterialCache = new Map<string, THREE.MeshLambertMaterial>();
const spriteMaterialCache = new Map<string, THREE.MeshLambertMaterial>();
const cylinderGeometryCache = new Map<string, THREE.CylinderGeometry>();
type InteriorEffect = (elapsed: number) => void;

function solid(color: number): THREE.MeshLambertMaterial {
  let material = lambertMaterialCache.get(color);
  if (!material) {
    material = new THREE.MeshLambertMaterial({ color });
    lambertMaterialCache.set(color, material);
  }
  return material;
}

function unlit(color: number): THREE.MeshBasicMaterial {
  let material = basicMaterialCache.get(color);
  if (!material) {
    material = new THREE.MeshBasicMaterial({ color, toneMapped: false });
    basicMaterialCache.set(color, material);
  }
  return material;
}

function textured(
  tex: THREE.Texture, tint = 0xffffff,
): THREE.MeshLambertMaterial {
  const key = `${tex.uuid}:${tint}`;
  let material = texturedMaterialCache.get(key);
  if (!material) {
    material = new THREE.MeshLambertMaterial({ map: tex, color: tint });
    texturedMaterialCache.set(key, material);
  }
  return material;
}

function spriteMaterial(tex: THREE.Texture): THREE.MeshLambertMaterial {
  let material = spriteMaterialCache.get(tex.uuid);
  if (!material) {
    material = new THREE.MeshLambertMaterial({
      map: tex,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    });
    spriteMaterialCache.set(tex.uuid, material);
  }
  return material;
}

function shouldCastBoxShadow(spec: FurnitureBox): boolean {
  if (spec.unlit) return false;
  const volume = spec.w * spec.d * spec.h;
  return spec.h >= 0.3
    && Math.max(spec.w, spec.d) >= 0.3
    && volume >= 0.025;
}

function shouldCastCylinderShadow(spec: FurnitureCylinder): boolean {
  const radius = Math.max(
    spec.radiusTop ?? spec.radius,
    spec.radiusBottom ?? spec.radius,
  );
  return spec.h >= 0.25 && radius >= 0.18;
}

function composeMatrix(
  position: THREE.Vector3,
  rotationX: number,
  rotationY: number,
  rotationZ: number,
  scale: THREE.Vector3,
): THREE.Matrix4 {
  const quaternion = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(rotationX, rotationY, rotationZ),
  );
  return new THREE.Matrix4().compose(position, quaternion, scale);
}

interface BatchEntry {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  castShadow: boolean;
  matrices: THREE.Matrix4[];
}

class FurnitureBatcher {
  private readonly entries = new Map<string, BatchEntry>();

  add(
    key: string,
    geometry: THREE.BufferGeometry,
    material: THREE.Material | THREE.Material[],
    castShadow: boolean,
    matrix: THREE.Matrix4,
  ): number {
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { geometry, material, castShadow, matrices: [] };
      this.entries.set(key, entry);
    }
    entry.matrices.push(matrix);
    return entry.matrices.length - 1;
  }

  build(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'interior-furniture-batches';
    for (const [key, entry] of this.entries) {
      const mesh = new THREE.InstancedMesh(
        entry.geometry, entry.material, entry.matrices.length,
      );
      mesh.name = `interior-batch.${key}`;
      entry.matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
      mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      mesh.castShadow = entry.castShadow;
      mesh.receiveShadow = true;
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
    return group;
  }
}

function furnitureMarker(
  name: string | undefined,
  position: THREE.Vector3,
  rotationX: number,
  rotationY: number,
  rotationZ: number,
  batchName: string,
  instanceId: number,
): THREE.Object3D {
  const marker = new THREE.Object3D();
  if (name) marker.name = name;
  marker.position.copy(position);
  marker.rotation.set(rotationX, rotationY, rotationZ);
  marker.userData.renderBatch = batchName;
  marker.userData.instanceId = instanceId;
  return marker;
}

async function buildFurnitureBox(
  spec: FurnitureBox,
  batcher: FurnitureBatcher,
  effects: InteriorEffect[],
): Promise<THREE.Object3D> {
  const base = spec.unlit
    ? unlit(spec.color ?? 0xffffff)
    : solid(spec.color ?? 0x8a6f46);
  const position = new THREE.Vector3(
    spec.x + spec.w / 2,
    (spec.y ?? 0) + spec.h / 2,
    spec.z + spec.d / 2,
  );
  const rotationX = spec.rotationX ?? 0;
  const rotationY = spec.rotationY ?? 0;
  const rotationZ = spec.rotationZ ?? 0;
  const scale = new THREE.Vector3(spec.w, spec.h, spec.d);
  const castShadow = shouldCastBoxShadow(spec);

  if (spec.glow) {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(spec.color ?? 0xffffff) },
        uTime: { value: 0 },
        uSpeed: { value: spec.glow.speed },
        uStrength: { value: spec.glow.strength },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uTime;
        uniform float uSpeed;
        uniform float uStrength;
        varying vec2 vUv;
        void main() {
          float pulseA = 0.5 + 0.5 * sin(uTime * uSpeed);
          float pulseB = 0.5 + 0.5 * sin(uTime * uSpeed * 2.17 + 1.3);
          float scan = pow(max(0.0, sin(vUv.y * 6.283 - uTime * uSpeed * 1.35)), 10.0);
          float brightness = 1.0 - uStrength * 0.55
            + uStrength * (pulseA * 0.62 + pulseB * 0.24 + scan * 0.72);
          gl_FragColor = vec4(uColor * brightness, 1.0);
        }
      `,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(UNIT_BOX, material);
    mesh.position.copy(position);
    mesh.rotation.set(rotationX, rotationY, rotationZ);
    mesh.scale.copy(scale);
    if (spec.name) mesh.name = spec.name;
    mesh.receiveShadow = true;
    effects.push((elapsed) => { material.uniforms.uTime.value = elapsed; });
    return mesh;
  }

  // 纯色盒体走单材质实例批次。此前即使六面材质相同也传数组，
  // BoxGeometry 的六个 group 会因此产生六次 draw call。
  if (!spec.top && !spec.front) {
    const key = `box.${spec.unlit ? 'unlit' : 'lit'}.${spec.color ?? (spec.unlit ? 0xffffff : 0x8a6f46)}.${castShadow ? 'shadow' : 'plain'}`;
    const instanceId = batcher.add(
      key,
      UNIT_BOX,
      base,
      castShadow,
      composeMatrix(position, rotationX, rotationY, rotationZ, scale),
    );
    return furnitureMarker(
      spec.name, position, rotationX, rotationY, rotationZ, key, instanceId,
    );
  }

  const materials: THREE.Material[] = [base, base, base, base, base, base];
  if (spec.top) {
    materials[TOP] = textured(await loadPixelTexture(spec.top));
  }
  if (spec.front) {
    const frontTex = await loadPixelTexture(spec.front);
    materials[SOUTH] = textured(frontTex);
    // 侧面复用正面贴图并压暗，避免大面积纯色显得像积木
    const sideMat = textured(frontTex, spec.sideTint ?? 0xb8b8b8);
    materials[EAST] = sideMat;
    materials[WEST] = sideMat;
  }
  const mesh = new THREE.Mesh(
    UNIT_BOX,
    materials,
  );
  mesh.position.copy(position);
  mesh.rotation.set(rotationX, rotationY, rotationZ);
  mesh.scale.copy(scale);
  if (spec.name) mesh.name = spec.name;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  return mesh;
}

function normalizedCylinderGeometry(spec: FurnitureCylinder): {
  geometry: THREE.CylinderGeometry;
  key: string;
} {
  const topRatio = (spec.radiusTop ?? spec.radius) / spec.radius;
  const bottomRatio = (spec.radiusBottom ?? spec.radius) / spec.radius;
  const key = `${topRatio.toFixed(5)}:${bottomRatio.toFixed(5)}:${spec.segments ?? 16}`;
  let geometry = cylinderGeometryCache.get(key);
  if (!geometry) {
    geometry = new THREE.CylinderGeometry(
      topRatio, bottomRatio, 1, spec.segments ?? 16,
    );
    cylinderGeometryCache.set(key, geometry);
  }
  return { geometry, key };
}

async function buildFurnitureCylinder(
  spec: FurnitureCylinder,
  batcher: FurnitureBatcher,
): Promise<THREE.Object3D> {
  const side = spec.front
    ? textured(await loadPixelTexture(spec.front))
    : solid(spec.color ?? 0x73737f);
  const top = spec.top
    ? textured(await loadPixelTexture(spec.top))
    : solid(spec.color ?? 0x73737f);
  const bottom = solid(spec.color ?? 0x4d4d58);
  const materials = [side, top, bottom];
  const { geometry, key: geometryKey } = normalizedCylinderGeometry(spec);
  const position = new THREE.Vector3(
    spec.x, (spec.y ?? 0) + spec.h / 2, spec.z,
  );
  const rotationX = spec.rotationX ?? 0;
  const rotationY = spec.rotationY ?? 0;
  const rotationZ = spec.rotationZ ?? 0;
  const scale = new THREE.Vector3(spec.radius, spec.h, spec.radius);
  const castShadow = shouldCastCylinderShadow(spec);

  if (!spec.front && !spec.top) {
    const color = spec.color ?? 0x73737f;
    const batchKey = `cylinder.${geometryKey}.${color}.${castShadow ? 'shadow' : 'plain'}`;
    // 显式纯色圆柱的三组材质完全相同，可作为单材质一次提交。
    // 没有显式颜色时仍保留较暗底面。
    const batchMaterial = spec.color === undefined ? materials : side;
    const instanceId = batcher.add(
      batchKey,
      geometry,
      batchMaterial,
      castShadow,
      composeMatrix(position, rotationX, rotationY, rotationZ, scale),
    );
    return furnitureMarker(
      spec.name, position, rotationX, rotationY, rotationZ, batchKey, instanceId,
    );
  }

  const mesh = new THREE.Mesh(geometry, materials);
  mesh.position.copy(position);
  mesh.scale.copy(scale);
  mesh.rotation.set(rotationX, rotationY, rotationZ);
  if (spec.name) mesh.name = spec.name;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  return mesh;
}

async function buildFurnitureSprite(spec: FurnitureSprite): Promise<THREE.Group> {
  const texture = await loadPixelTexture(spec.texture);
  const material = spriteMaterial(texture);
  const geometry = new THREE.PlaneGeometry(spec.w, spec.h);
  geometry.translate(0, spec.h / 2, 0);
  const group = new THREE.Group();
  if (spec.name) group.name = spec.name;
  group.position.set(spec.x, spec.y ?? 0, spec.z);
  const front = new THREE.Mesh(geometry, material);
  const sideMesh = new THREE.Mesh(geometry, material);
  sideMesh.rotation.y = Math.PI / 2;
  front.castShadow = sideMesh.castShadow = spec.w * spec.h >= 0.5;
  front.receiveShadow = sideMesh.receiveShadow = true;
  group.add(front, sideMesh);
  return group;
}

function buildLightPatch(spec: FurnitureLightPatch): THREE.Mesh {
  const color = new THREE.Color(spec.color);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: color },
      uOpacity: { value: spec.opacity },
      uFeather: { value: spec.feather ?? 0.16 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uFeather;
      varying vec2 vUv;
      void main() {
        float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
        float softEdge = smoothstep(0.0, uFeather, edge);
        float distanceFade = mix(1.0, 0.3, vUv.y);
        gl_FragColor = vec4(uColor, uOpacity * softEdge * distanceFade);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(spec.w, spec.d), material);
  mesh.name = spec.name;
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = spec.rotationY ?? 0;
  mesh.position.set(spec.x, spec.y ?? 0.018, spec.z);
  mesh.renderOrder = 2;
  return mesh;
}

function buildDust(spec: FurnitureDust): THREE.Points {
  const positions = new Float32Array(spec.count * 3);
  // 固定种子确保每次进入房间的粒子构图一致。
  let seed = 0x51f15e;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  for (let i = 0; i < spec.count; i++) {
    positions[i * 3] = spec.x + random() * spec.w;
    positions[i * 3 + 1] = spec.minY + random() * (spec.maxY - spec.minY);
    positions[i * 3 + 2] = spec.z + random() * spec.d;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const color = new THREE.Color(spec.color);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: color },
      uSize: { value: spec.size },
      uOpacity: { value: spec.opacity },
      uTime: { value: 0 },
    },
    vertexShader: `
      uniform float uSize;
      uniform float uTime;
      varying float vTwinkle;
      void main() {
        vec3 animated = position;
        float phase = dot(position, vec3(1.73, 2.41, 1.19));
        animated.x += sin(uTime * 0.65 + phase) * 0.16
          + cos(uTime * 0.28 + position.y * 2.7) * 0.06;
        animated.y += sin(uTime * 0.52 + phase * 1.31) * 0.09
          + cos(uTime * 0.33 + position.z * 1.9) * 0.035;
        animated.z += cos(uTime * 0.48 + phase * 1.17) * 0.12;
        vTwinkle = 0.5 + 0.5 * sin(uTime * 1.05 + phase * 1.8);
        vec4 mvPosition = modelViewMatrix * vec4(animated, 1.0);
        gl_PointSize = clamp(uSize * (7.0 / -mvPosition.z), 1.2, 6.0);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vTwinkle;
      void main() {
        float radius = distance(gl_PointCoord, vec2(0.5));
        float twinkle = mix(0.62, 1.0, vTwinkle);
        float alpha = (1.0 - smoothstep(0.18, 0.5, radius)) * uOpacity * twinkle;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const points = new THREE.Points(geometry, material);
  points.name = spec.name;
  points.renderOrder = 3;
  points.onBeforeRender = () => {
    material.uniforms.uTime.value = performance.now() * 0.001;
  };
  return points;
}

async function buildFurniture(
  spec: InteriorFurniture,
  batcher: FurnitureBatcher,
  effects: InteriorEffect[],
): Promise<THREE.Object3D> {
  if (spec.kind === 'group') {
    const group = new THREE.Group();
    group.name = spec.name;
    group.add(...await Promise.all(
      spec.children.map((child) => buildFurniture(child, batcher, effects)),
    ));
    return group;
  }
  if (spec.kind === 'light') {
    if (spec.lightType === 'spot') {
      const light = new THREE.SpotLight(
        spec.color, spec.intensity, spec.distance,
        spec.angle ?? Math.PI / 4, spec.penumbra ?? 0.65, spec.decay ?? 2,
      );
      light.name = spec.name;
      light.position.set(spec.x, spec.y, spec.z);
      const target = new THREE.Object3D();
      target.name = `${spec.name}-target`;
      target.position.set(
        spec.target?.x ?? spec.x,
        spec.target?.y ?? 0,
        spec.target?.z ?? spec.z + 1,
      );
      light.target = target;
      const group = new THREE.Group();
      group.name = `${spec.name}-rig`;
      group.add(light, target);
      if (spec.pulse) {
        const { minIntensity, maxIntensity, speed } = spec.pulse;
        effects.push((elapsed) => {
          light.intensity = THREE.MathUtils.lerp(
            minIntensity, maxIntensity, 0.5 + 0.5 * Math.sin(elapsed * speed),
          );
        });
      }
      return group;
    }
    const light = new THREE.PointLight(
      spec.color, spec.intensity, spec.distance, spec.decay ?? 2,
    );
    light.name = spec.name;
    light.position.set(spec.x, spec.y, spec.z);
    if (spec.pulse) {
      const { minIntensity, maxIntensity, speed } = spec.pulse;
      effects.push((elapsed) => {
        light.intensity = THREE.MathUtils.lerp(
          minIntensity, maxIntensity, 0.5 + 0.5 * Math.sin(elapsed * speed),
        );
      });
    }
    return light;
  }
  if (spec.kind === 'lightPatch') return buildLightPatch(spec);
  if (spec.kind === 'dust') return buildDust(spec);
  if (spec.kind === 'cylinder') return buildFurnitureCylinder(spec, batcher);
  if (spec.kind === 'sprite') return buildFurnitureSprite(spec);
  return buildFurnitureBox(spec, batcher, effects);
}

export async function buildInterior(map: MapData): Promise<THREE.Group> {
  const spec = map.interior;
  if (!spec) throw new Error(`地图 ${map.id} 缺少 interior 描述`);
  const group = new THREE.Group();
  group.name = 'interior';
  const effects: InteriorEffect[] = [];

  // --- 地板 ---
  const floorTex = await loadPixelTexture(map.groundTexture);
  const { floor, wall } = spec;
  const floorMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(floor.width, floor.height),
    textured(floorTex),
  );
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.set(
    floor.x + floor.width / 2, 0, floor.y + floor.height / 2,
  );
  floorMesh.receiveShadow = true;
  floorMesh.name = 'interior-floor';
  group.add(floorMesh);

  // --- 北墙盒体：内侧(+z)贴图（窗/楼梯口已烘焙），顶面收边 ---
  const cap = solid(wall.capColor);
  const body = solid(wall.baseColor);
  const northTex = await loadPixelTexture(wall.northTexture);
  const northWall = new THREE.Mesh(
    UNIT_BOX,
    [body, body, cap, body, textured(northTex), body],
  );
  northWall.scale.set(map.width, wall.height, wall.thickness);
  northWall.position.set(
    map.width / 2, wall.height / 2, wall.northZ - wall.thickness / 2,
  );
  northWall.castShadow = true;
  northWall.receiveShadow = true;
  northWall.name = 'interior-north-wall';
  group.add(northWall);

  // --- 侧墙盒体：内侧条带贴图沿纵深平铺；南端(+z)露出亮色横截面 ---
  const southEdge = floor.y + floor.height;
  const wallDepth = southEdge - wall.northZ + wall.thickness;
  const wallCenterZ = wall.northZ - wall.thickness + wallDepth / 2;
  const sideTexBase = await loadPixelTexture(wall.sideTexture);

  const makeSideWall = (x: number, innerFace: typeof EAST | typeof WEST) => {
    const tex = sideTexBase.clone();
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.set(wallDepth, 1);
    tex.needsUpdate = true;
    const materials: THREE.MeshLambertMaterial[] = [
      body, body, cap, body, cap, body,
    ];
    materials[innerFace] = textured(tex);
    const mesh = new THREE.Mesh(
      UNIT_BOX,
      materials,
    );
    mesh.scale.set(wall.thickness, wall.height, wallDepth);
    mesh.position.set(x, wall.height / 2, wallCenterZ);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };
  const westWall = makeSideWall(-wall.thickness / 2, EAST);
  westWall.name = 'interior-west-wall';
  const eastWall = makeSideWall(map.width + wall.thickness / 2, WEST);
  eastWall.name = 'interior-east-wall';
  group.add(westWall, eastWall);

  // --- 立体家具 ---
  const batcher = new FurnitureBatcher();
  const furniture = await Promise.all(
    spec.furniture.map((item) => buildFurniture(item, batcher, effects)),
  );
  group.add(...furniture, batcher.build());
  group.userData.updateEffects = (elapsed: number) => {
    for (const effect of effects) effect(elapsed);
  };

  return group;
}
