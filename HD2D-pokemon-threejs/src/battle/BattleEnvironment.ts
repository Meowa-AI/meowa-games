import * as THREE from 'three';
import { loadPixelTexture } from '../core/AssetLoader';
import type { BattleVisualQuality } from './BattleQuality';
import type { BattleArenaKind } from '../map/MapData';

const PIXEL_ROOT = 'assets/battle/environment/pixel';
const REFERENCE_ROOT = 'assets/battle/environment/pokemon-reference';
const MEOWA_VARIANT_ROOT = 'assets/battle/environment/meowa-variants';
const CLEARING_RADIUS = 28;

const TREE_TEXTURES = [
  'color_tree1', 'color_tree2', 'color_tree3', 'color_tree4',
] as const;
const CANOPY_TEXTURES = [
  'layered_leaves1', 'layered_leaves2', 'layered_leaves3', 'layered_leaves4', 'layered_leaves5',
] as const;
const ROCK_TEXTURES = [
  'shape_rock1', 'shape_rock2', 'shape_rock3', 'shape_rock4',
] as const;
const GRASS_TEXTURES = [
  'shape_grass1', 'shape_grass2', 'shape_grass3', 'shape_grass4',
] as const;

interface PixelPlacement {
  x: number;
  z: number;
  height: number;
  widthScale?: number;
}

export interface BattleEnvironment {
  root: THREE.Group;
  textures: readonly THREE.Texture[];
  update: (elapsed: number) => void;
}

/**
 * 使用 Meowa 配色树与形状变体草石搭建独立战斗空地。
 * 树草石不再加载接近原图的参考变体；天空仍从参考条带裁出。
 */
export async function buildBattleEnvironment(
  center: THREE.Vector3,
  quality: BattleVisualQuality = 'full',
  kind: BattleArenaKind = 'forest',
): Promise<BattleEnvironment> {
  const textureUrls = new Map<string, string>([
    ...['grass', 'forest_floor'].map(
      (name) => [name, `${PIXEL_ROOT}/${name}.png`] as const,
    ),
    ['sky_strip', `${REFERENCE_ROOT}/sky/skylight-strip.png`],
    ...[1, 2, 3, 4].map(
      (index) => [`color_tree${index}`, `${MEOWA_VARIANT_ROOT}/trees/colors/tree-color${index}.png`] as const,
    ),
    ...[1, 2, 3, 4, 5].map(
      (index) => [`layered_leaves${index}`, `${MEOWA_VARIANT_ROOT}/trees/layers/leaves${index}.png`] as const,
    ),
    ...[1, 2, 3, 4].map(
      (index) => [`shape_rock${index}`, `${MEOWA_VARIANT_ROOT}/props/rock-shape${index}.png`] as const,
    ),
    ...[1, 2, 3, 4].map(
      (index) => [`shape_grass${index}`, `${MEOWA_VARIANT_ROOT}/props/grass-shape${index}.png`] as const,
    ),
  ]);
  const textureNames = [...textureUrls.keys()];
  const loaded = await Promise.all(
    textureNames.map((name) => loadPixelTexture(textureUrls.get(name)!)),
  );
  const textures = new Map<string, THREE.Texture>();
  textureNames.forEach((name, index) => textures.set(name, loaded[index]));

  const root = new THREE.Group();
  root.name = 'battle-environment';
  if (kind !== 'forest') {
    return buildThemedEnvironment(root, center, quality, kind, textures);
  }
  const skybox = createReferenceSkybox(center, textures.get('sky_strip')!);
  const grassTexture = repeatPixelTexture(textures.get('grass')!, 12, 12);
  const forestTexture = repeatPixelTexture(textures.get('forest_floor')!, 8, 8);
  const atmosphere = createAtmosphere(center, quality);
  const vegetationUpdates: Array<(elapsed: number) => void> = [];
  root.add(
    skybox.mesh,
    skybox.backdrop,
    createClearing(center, grassTexture, forestTexture),
    createBattleLights(center, quality),
    atmosphere.root,
  );

  // 四种完整树与五种独立林冠共同占用森林位置。先均衡填入九种素材再做
  // 确定性洗牌，避免同类沿圆环连续成块，同时保留三圈前后交叠的纵深。
  const forestTreeCount = quality === 'full' ? 104 : 60;
  const completeTreePlacements: PixelPlacement[][] = TREE_TEXTURES.map(() => []);
  const canopyPlacements: PixelPlacement[][] = CANOPY_TEXTURES.map(() => []);
  const forestVariantCount = TREE_TEXTURES.length + CANOPY_TEXTURES.length;
  const forestVariantOrder = shuffledVariantOrder(forestTreeCount, forestVariantCount);
  const forestTreeRings = [16.4, 19.5, 22.6] as const;
  for (let index = 0; index < forestTreeCount; index++) {
    const row = index % 3;
    const angle = (index + 0.5 + row * 0.23) / forestTreeCount * Math.PI * 2;
    const radius = forestTreeRings[row] + (hash(index * 101 + 11) - 0.5) * 0.65;
    const placement = {
      x: center.x + Math.sin(angle) * radius,
      z: center.z + Math.cos(angle) * radius,
      height: 7.2 + hash(index * 107 + 5) * 1.65 - row * 0.1,
      widthScale: 0.96 + hash(index * 109) * 0.08,
    };
    const variant = forestVariantOrder[index];
    if (variant < TREE_TEXTURES.length) {
      completeTreePlacements[variant].push(placement);
    } else {
      canopyPlacements[variant - TREE_TEXTURES.length].push({
        ...placement,
        height: placement.height * 1.04,
        widthScale: (placement.widthScale ?? 1) * 1.08,
      });
    }
  }
  TREE_TEXTURES.forEach((textureName, index) => root.add(createPixelInstances(
    `battle-shape-tree${index + 1}`,
    textures.get(textureName)!,
    completeTreePlacements[index],
    0.12,
    { strength: 0.035, speed: 1.15, updates: vegetationUpdates },
  )));

  CANOPY_TEXTURES.forEach((textureName, index) => root.add(createPixelInstances(
    `battle-forest-canopy${index + 1}`,
    textures.get(textureName)!,
    canopyPlacements[index],
    0.12,
    { strength: 0.042, speed: 1.08, updates: vegetationUpdates },
  )));

  const rockPlacements: PixelPlacement[][] = ROCK_TEXTURES.map(() => []);
  const rockCount = quality === 'full' ? 26 : 14;
  for (let index = 0; index < rockCount; index++) {
    const angle = (index + 0.43) / rockCount * Math.PI * 2;
    const radius = 9.8 + hash(index * 103 + 4) * 10.8;
    rockPlacements[index % rockPlacements.length].push({
      x: center.x + Math.sin(angle) * radius,
      z: center.z + Math.cos(angle) * radius,
      height: 0.72 + hash(index * 107) * 0.72,
      widthScale: 1.12,
    });
  }
  ROCK_TEXTURES.forEach((textureName, index) => root.add(createPixelInstances(
    `battle-shape-rock${index + 1}`,
    textures.get(textureName)!, rockPlacements[index], 0.12,
  )));

  const grassPlacements: PixelPlacement[][] = GRASS_TEXTURES.map(() => []);
  const grassCount = quality === 'full' ? 120 : 62;
  for (let index = 0; index < grassCount; index++) {
    const angle = hash(index * 109 + 6) * Math.PI * 2;
    const radius = 9.5 + hash(index * 113 + 9) * 12.5;
    grassPlacements[index % grassPlacements.length].push({
      x: center.x + Math.sin(angle) * radius,
      z: center.z + Math.cos(angle) * radius,
      height: 0.78 + hash(index * 127) * 0.68,
      widthScale: 1.42,
    });
  }
  GRASS_TEXTURES.forEach((textureName, index) => root.add(createPixelInstances(
    `battle-shape-grass${index + 1}`,
    textures.get(textureName)!, grassPlacements[index], 0.08,
    { strength: 0.075, speed: 1.75, updates: vegetationUpdates },
  )));

  const foregroundGrass: PixelPlacement[][] = GRASS_TEXTURES.map(() => []);
  const foregroundCount = quality === 'full' ? 24 : 10;
  for (let index = 0; index < foregroundCount; index++) {
    const side = index % 2 === 0 ? -1 : 1;
    foregroundGrass[index % foregroundGrass.length].push({
      x: center.x + side * (3.6 + hash(index * 71) * 3.8),
      z: center.z + 6.2 + hash(index * 73) * 2.8,
      height: 1.08 + hash(index * 79) * 0.74,
      widthScale: 1.48,
    });
  }
  const foregroundGrassRoot = new THREE.Group();
  foregroundGrassRoot.name = 'battle-reference-foreground-grass';
  GRASS_TEXTURES.forEach((textureName, index) => foregroundGrassRoot.add(createPixelInstances(
    `battle-foreground-grass-${index + 1}`,
    textures.get(textureName)!, foregroundGrass[index], 0.08,
    { strength: 0.085, speed: 1.85, updates: vegetationUpdates },
  )));
  root.add(foregroundGrassRoot);

  return {
    root,
    textures: [...skybox.textures, grassTexture, forestTexture],
    update: (elapsed: number) => {
      atmosphere.update(elapsed);
      vegetationUpdates.forEach((update) => update(elapsed));
    },
  };
}

function buildThemedEnvironment(
  root: THREE.Group,
  center: THREE.Vector3,
  quality: BattleVisualQuality,
  kind: Exclude<BattleArenaKind, 'forest'>,
  textures: ReadonlyMap<string, THREE.Texture>,
): BattleEnvironment {
  const theme = new THREE.Group();
  theme.name = `battle-environment-${kind}`;
  root.add(theme);
  const updates: Array<(elapsed: number) => void> = [];

  if (kind === 'interior') {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(36, 28),
      new THREE.MeshStandardMaterial({ color: 0x765b46, roughness: 0.94 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.copy(center).setY(-0.02);
    floor.receiveShadow = true;
    theme.add(floor);
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x493c3c, roughness: 1 });
    const wall = new THREE.Mesh(new THREE.BoxGeometry(34, 10, 0.5), wallMaterial);
    wall.position.set(center.x, 5, center.z - 11);
    theme.add(wall);
    for (const side of [-1, 1]) {
      const pillar = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 7, 1.2),
        new THREE.MeshStandardMaterial({ color: 0x8d6049, roughness: 1, flatShading: true }),
      );
      pillar.position.set(center.x + side * 8.7, 3.5, center.z - 7.8);
      theme.add(pillar);
    }
    const light = new THREE.PointLight(0xffc47b, quality === 'full' ? 17 : 10, 25, 1.6);
    light.position.set(center.x, 7, center.z + 1);
    theme.add(light, new THREE.HemisphereLight(0xf4cf9e, 0x322a2d, 1.5));
  } else if (kind === 'cave') {
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(19, 28),
      new THREE.MeshStandardMaterial({ color: 0x343c49, roughness: 1, flatShading: true }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.copy(center).setY(-0.02);
    ground.receiveShadow = true;
    theme.add(ground);
    const rocks: PixelPlacement[][] = ROCK_TEXTURES.map(() => []);
    const count = quality === 'full' ? 30 : 16;
    for (let index = 0; index < count; index++) {
      const angle = index / count * Math.PI * 2;
      const radius = 9.5 + hash(index * 43) * 6;
      rocks[index % rocks.length].push({ x: center.x + Math.sin(angle) * radius, z: center.z + Math.cos(angle) * radius,
        height: 1.7 + hash(index * 47) * 2.8, widthScale: 1.1 });
    }
    ROCK_TEXTURES.forEach((textureName, index) => theme.add(createPixelInstances(
      index === 0 ? 'battle-cave-shape-rocks' : `battle-cave-rock-variant${index + 1}`,
      textures.get(textureName)!, rocks[index], 0.12,
    )));
    for (const side of [-1, 1]) {
      const crystal = new THREE.Mesh(
        new THREE.ConeGeometry(0.34, 2.8, 5),
        new THREE.MeshStandardMaterial({ color: 0x68c7ff, emissive: 0x23628e, emissiveIntensity: 2 }),
      );
      crystal.position.set(center.x + side * 7, 1.4, center.z - 5.5);
      theme.add(crystal);
    }
    theme.add(new THREE.HemisphereLight(0x638db7, 0x0e1420, 1.25));
    const light = new THREE.PointLight(0x5dbdff, quality === 'full' ? 20 : 12, 28);
    light.position.set(center.x, 5, center.z - 1);
    theme.add(light);
  } else {
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(18, 48),
      new THREE.MeshStandardMaterial({ color: 0x282044, emissive: 0x100828, emissiveIntensity: 0.7 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.copy(center).setY(-0.02);
    theme.add(ground);
    for (let ringIndex = 0; ringIndex < 4; ringIndex++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(3.8 + ringIndex * 2.4, 0.055, 4, 64),
        new THREE.MeshBasicMaterial({ color: ringIndex % 2 ? 0x72ddff : 0xc78aff }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(center).setY(0.03 + ringIndex * 0.01);
      theme.add(ring);
      updates.push((elapsed) => { ring.rotation.z = elapsed * (0.035 + ringIndex * 0.012); });
    }
    const starGeometry = new THREE.BufferGeometry();
    const count = quality === 'full' ? 120 : 48;
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index++) {
      const angle = hash(index * 59) * Math.PI * 2;
      const radius = 8 + hash(index * 61) * 10;
      positions[index * 3] = center.x + Math.sin(angle) * radius;
      positions[index * 3 + 1] = 1 + hash(index * 67) * 10;
      positions[index * 3 + 2] = center.z + Math.cos(angle) * radius;
    }
    starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0xd7c9ff, size: 0.12 }));
    theme.add(stars, new THREE.HemisphereLight(0x9578df, 0x120b2c, 1.8));
    updates.push((elapsed) => { stars.rotation.y = elapsed * 0.018; });
  }

  return { root, textures: [], update: (elapsed) => updates.forEach((update) => update(elapsed)) };
}

interface VegetationSwayOptions {
  strength: number;
  speed: number;
  updates: Array<(elapsed: number) => void>;
}

function createPixelInstances(
  name: string,
  texture: THREE.Texture,
  placements: readonly PixelPlacement[],
  alphaTest: number,
  sway?: VegetationSwayOptions,
): THREE.InstancedMesh {
  const image = texture.image as { width?: number; height?: number };
  const aspect = image.width && image.height ? image.width / image.height : 1;
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    alphaTest,
    depthWrite: true,
    side: THREE.DoubleSide,
    toneMapped: true,
  });
  if (sway) {
    const time = { value: 0 };
    material.userData.vegetationSway = {
      time,
      strength: sway.strength,
      speed: sway.speed,
    };
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uVegetationTime = time;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform float uVegetationTime;`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           {
             float rootHeight = clamp(position.y + 0.5, 0.0, 1.0);
             #ifdef USE_INSTANCING
               float instancePhase = instanceMatrix[3].x * 0.73 + instanceMatrix[3].z * 0.91;
               float gust = sin(uVegetationTime * ${sway.speed.toFixed(3)} + instancePhase)
                 + sin(uVegetationTime * 0.47 + instancePhase * 0.37) * 0.28;
               transformed.x += gust * rootHeight * rootHeight * ${sway.strength.toFixed(3)};
             #endif
           }`,
        );
    };
    material.customProgramCacheKey = () => `battle-vegetation-${sway.strength}-${sway.speed}`;
    sway.updates.push((elapsed) => { time.value = elapsed; });
  }
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), material, placements.length);
  mesh.name = name;
  mesh.frustumCulled = false;
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  placements.forEach((placement, index) => {
    const width = placement.height * aspect * (placement.widthScale ?? 1);
    position.set(placement.x, placement.height / 2 + 0.015, placement.z);
    scale.set(width, placement.height, 1);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

function createReferenceSkybox(
  center: THREE.Vector3,
  strip: THREE.Texture,
): { mesh: THREE.Mesh; backdrop: THREE.Mesh; textures: THREE.CanvasTexture[] } {
  const source = strip.image as CanvasImageSource & { width: number; height: number };
  const faceSize = Math.min(source.width, Math.floor(source.height / 6));
  const textures: THREE.CanvasTexture[] = [];
  const materials: THREE.MeshBasicMaterial[] = [];
  for (let face = 0; face < 6; face++) {
    const canvas = document.createElement('canvas');
    canvas.width = faceSize;
    canvas.height = faceSize;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法创建战斗天空盒画布');
    context.imageSmoothingEnabled = false;
    context.drawImage(source, 0, face * faceSize, faceSize, faceSize, 0, 0, faceSize, faceSize);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = false;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    textures.push(texture);
    materials.push(new THREE.MeshBasicMaterial({
      map: texture,
      color: 0xa7b8c8,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      toneMapped: true,
    }));
  }
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(74, 74, 74), materials);
  mesh.name = 'battle-reference-skybox';
  mesh.position.copy(center).add(new THREE.Vector3(0, 12, 0));
  mesh.renderOrder = -100;
  // 第五面是向上的蓝天云层；在树林远端再放一张同源远景，保证低机位仍能读到天空。
  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(46, 30),
    new THREE.MeshBasicMaterial({
      map: textures[4],
      color: 0xa7b8c8,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: false,
      toneMapped: true,
    }),
  );
  backdrop.name = 'battle-reference-sky-backdrop';
  backdrop.position.copy(center).add(new THREE.Vector3(0, 7.5, -25));
  backdrop.renderOrder = -99;
  return { mesh, backdrop, textures };
}

function createClearing(
  center: THREE.Vector3,
  grassTexture: THREE.Texture,
  forestTexture: THREE.Texture,
): THREE.Group {
  const clearing = new THREE.Group();
  clearing.name = 'battle-pixel-clearing';
  clearing.position.copy(center);
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(CLEARING_RADIUS, CLEARING_RADIUS + 0.5, 0.25, 64),
    new THREE.MeshStandardMaterial({ color: 0x315c2d, roughness: 1, flatShading: true }),
  );
  base.position.y = -0.14;
  base.receiveShadow = true;
  clearing.add(base);
  const grass = new THREE.Mesh(
    new THREE.CircleGeometry(CLEARING_RADIUS, 64),
    new THREE.MeshStandardMaterial({ map: grassTexture, roughness: 1 }),
  );
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = -0.005;
  grass.receiveShadow = true;
  clearing.add(grass);
  const forestEdge = new THREE.Mesh(
    new THREE.RingGeometry(14.5, CLEARING_RADIUS, 64),
    new THREE.MeshStandardMaterial({ map: forestTexture, roughness: 1 }),
  );
  forestEdge.rotation.x = -Math.PI / 2;
  forestEdge.position.y = 0.004;
  forestEdge.receiveShadow = true;
  clearing.add(forestEdge);
  return clearing;
}

function createBattleLights(center: THREE.Vector3, quality: BattleVisualQuality): THREE.Group {
  const lights = new THREE.Group();
  lights.name = 'battle-lights';
  const sky = new THREE.HemisphereLight(0xc8ebf2, 0x263b24, 1.25);
  const sun = new THREE.DirectionalLight(0xffedc5, 2.05);
  sun.position.copy(center).add(new THREE.Vector3(-10, 18, 9));
  sun.target.position.copy(center).add(new THREE.Vector3(0, 0, -2));
  sun.castShadow = true;
  const shadowSize = quality === 'full' ? 1024 : 512;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  sun.shadow.camera.left = -15;
  sun.shadow.camera.right = 15;
  sun.shadow.camera.top = 15;
  sun.shadow.camera.bottom = -15;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 45;
  sun.shadow.bias = -0.00025;
  lights.add(sky, sun, sun.target);
  return lights;
}

function createAtmosphere(
  center: THREE.Vector3,
  quality: BattleVisualQuality,
): { root: THREE.Group; update: (elapsed: number) => void } {
  const root = new THREE.Group();
  root.name = 'battle-atmosphere';
  root.position.copy(center);
  if (quality === 'reduced') return { root, update: () => undefined };

  const shafts = new THREE.Group();
  shafts.name = 'battle-sun-shafts';
  for (let index = 0; index < 3; index++) {
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 1.5 + index * 0.25, 11, 5, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xfff1bd,
        transparent: true,
        opacity: 0.004,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    );
    shaft.position.set(-6 + index * 5.6, 5.8, -4 - index * 1.8);
    shaft.rotation.z = -0.34;
    shaft.renderOrder = -2;
    shafts.add(shaft);
  }
  root.add(shafts);

  const count = 54;
  const positions = new Float32Array(count * 3);
  const baseX = new Float32Array(count);
  const baseY = new Float32Array(count);
  for (let index = 0; index < count; index++) {
    positions[index * 3] = baseX[index] = (hash(index * 89) - 0.5) * 18;
    positions[index * 3 + 1] = baseY[index] = 0.5 + hash(index * 97) * 5.8;
    positions[index * 3 + 2] = (hash(index * 101) - 0.5) * 16;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const motes = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: 0xffefac,
      size: 0.075,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
    }),
  );
  motes.name = 'battle-air-motes';
  motes.frustumCulled = false;
  root.add(motes);

  return {
    root,
    update: (elapsed: number) => {
      const attribute = geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let index = 0; index < count; index++) {
        attribute.setY(index, baseY[index] + Math.sin(elapsed * 0.72 + index * 1.73) * 0.22);
        attribute.setX(index, baseX[index] + Math.sin(elapsed * 0.31 + index) * 0.08);
      }
      attribute.needsUpdate = true;
      shafts.children.forEach((shaft, index) => {
        const material = (shaft as THREE.Mesh).material as THREE.MeshBasicMaterial;
        material.opacity = 0.004 + Math.sin(elapsed * 0.45 + index) * 0.0015;
      });
    },
  };
}

function repeatPixelTexture(source: THREE.Texture, x: number, y: number): THREE.Texture {
  const texture = source.clone();
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(x, y);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/** 稳定伪随机数，让每次战斗和截图都使用同一套像素森林布局。 */
function hash(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

/** 均衡覆盖全部变体，再以固定种子打散，保证截图稳定且相邻树种不按类别成组。 */
function shuffledVariantOrder(count: number, variantCount: number): number[] {
  const order = Array.from({ length: count }, (_, index) => index % variantCount);
  for (let index = order.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(hash(index * 197 + 23) * (index + 1));
    [order[index], order[swapIndex]] = [order[swapIndex], order[index]];
  }
  return order;
}
