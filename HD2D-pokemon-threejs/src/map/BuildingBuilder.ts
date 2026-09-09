import * as THREE from 'three';
import { loadPixelTexture } from '../core/AssetLoader';
import { extrudePixelSpriteGeometry } from './PixelSpriteExtruder';

/**
 * 3D 建筑构建：基于 Meowa image edit 原创化三视图的"分层拆解"建模。
 * 民居 = 一层墙体盒 → 檐棚山墙顶 → 二层窗带盒 → 主山墙顶；
 * 研究所 = 墙体盒 + 单层山墙顶 + 3D 圆盘天线。
 * 运行时贴图全部来自 Meowa image edit 后的原创化三视图裁切（scripts/prepare_assets.py）。
 * 局部坐标：原点在正面底边中心，建筑向 -z 延伸。
 */

const T = 'assets/sprites/props/turnaround/';

function lambert(tex: THREE.Texture, alphaTest = 0): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ map: tex, alphaTest });
}

/**
 * 全部带窗光的墙面材质注册表：DayNight 按时刻统一驱动 emissiveIntensity
 * （建筑经 clone 复用同一材质实例，改一处全生效）。
 */
export const glowMaterials: THREE.MeshLambertMaterial[] = [];

/**
 * 带窗户自发光的墙面材质：加载同名 `-emissive.png` 遮罩
 * （青色玻璃像素为亮色、其余为黑），配合 Bloom 形成窗光。
 * alphaTest 让立面裁切中画成透明的底角斜切保留剪影。
 */
async function wallLambert(name: string): Promise<THREE.MeshLambertMaterial> {
  const [tex, em] = await Promise.all([
    loadPixelTexture(T + name + '.png'),
    loadPixelTexture(T + name + '-emissive.png'),
  ]);
  const m = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5 });
  m.emissive = new THREE.Color(0xffffff);
  m.emissiveMap = em;
  m.emissiveIntensity = 0.7;
  glowMaterials.push(m);
  return m;
}

/** 克隆纹理并开启平铺（quad 的 UV 会超出 0..1） */
function tiled(tex: THREE.Texture): THREE.Texture {
  const t = tex.clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

function shadowed(mesh: THREE.Mesh): THREE.Mesh {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * 建筑视觉网格保留分层材质与透明裁切，但不直接参与阴影深度图；
 * 每个 prefab 另带一套封闭低模代理，避免薄壳屋面和 alphaTest 把阴影切碎。
 * colorWrite/depthWrite 只关闭主相机中的绘制，阴影 pass 仍会使用代理几何。
 */
const shadowProxyMaterial = new THREE.MeshBasicMaterial({
  color: 0x000000,
  colorWrite: false,
  depthWrite: false,
  side: THREE.DoubleSide,
});

function shadowProxyBox(
  w: number, h: number, d: number,
  x: number, y: number, z: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), shadowProxyMaterial);
  mesh.position.set(x, y, z);
  return mesh;
}

/** 封闭山墙棱柱：两片坡面、两端山墙和底面共用一个无贴图投影网格。 */
function shadowProxyGable(w: number, d: number, h: number): THREE.Mesh {
  const hw = w / 2;
  const hd = d / 2;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -hw, 0, hd, -hw, 0, -hd, -hw, h, 0,
     hw, 0, hd,  hw, 0, -hd,  hw, h, 0,
  ], 3));
  geometry.setIndex([
    0, 3, 5, 0, 5, 2, // front slope
    4, 1, 2, 4, 2, 5, // back slope
    1, 0, 2,           // left gable
    3, 4, 5,           // right gable
    1, 4, 3, 1, 3, 0, // bottom
  ]);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, shadowProxyMaterial);
}

/** 将现有分层建筑整理成可复用的 visual + shadow-proxy prefab。 */
function finalizeBuilding(
  building: THREE.Group,
  proxy: THREE.Group,
  name: string,
): THREE.Group {
  const visual = new THREE.Group();
  visual.name = 'visual';
  visual.add(...building.children.slice());
  visual.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = false;
    object.receiveShadow = true;
  });

  proxy.name = 'shadow-proxy';
  proxy.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = false;
  });

  building.name = `${name}-prefab`;
  building.add(visual, proxy);
  return building;
}

/**
 * 任意四边形面片（bl→br→tr→tl 逆时针，法线朝外）。
 * tileSize 给定时按面片实际边长平铺 UV；uvs 给定时使用显式 UV
 * （bl,br,tr,tl 顺序，共 8 个分量）；否则整幅拉伸。
 */
function quad(
  bl: THREE.Vector3,
  br: THREE.Vector3,
  tr: THREE.Vector3,
  tl: THREE.Vector3,
  material: THREE.Material,
  tileSize?: { w: number; h: number },
  uvs?: number[],
): THREE.Mesh {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [...bl.toArray(), ...br.toArray(), ...tr.toArray(), ...tl.toArray()],
      3,
    ),
  );
  let uv = uvs;
  if (!uv) {
    let ru = 1;
    let rv = 1;
    if (tileSize) {
      ru = bl.distanceTo(br) / tileSize.w;
      rv = bl.distanceTo(tl) / tileSize.h;
    }
    uv = [0, 0, ru, 0, ru, rv, 0, rv];
  }
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  geo.computeVertexNormals();
  return shadowed(new THREE.Mesh(geo, material));
}

interface RoofOptions {
  /** 宽（x）、进深（z）与檐口到屋脊的高度 */
  w: number; d: number; h: number;
  front: THREE.Material;
  back: THREE.Material;
  gable: THREE.Material;
  frontTile?: { w: number; h: number };
  backTile?: { w: number; h: number };
  ridge?: THREE.Material;
}

/**
 * 山墙屋顶：正背两片斜坡在中央屋脊相交，左右端面为三角形。
 * 三视图中侧面必须呈完整三角坡，不能用截顶梯形近似。
 */
function gableRoof(o: RoofOptions): THREE.Group {
  const g = new THREE.Group();
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const [hw, hd] = [o.w / 2, o.d / 2];

  // 正面坡（+z）和背面坡（-z）
  g.add(quad(
    v(-hw, 0, hd), v(hw, 0, hd), v(hw, o.h, 0), v(-hw, o.h, 0),
    o.front, o.frontTile,
  ));
  g.add(quad(
    v(hw, 0, -hd), v(-hw, 0, -hd), v(-hw, o.h, 0), v(hw, o.h, 0),
    o.back, o.backTile,
  ));

  const addGable = (x: number, right: boolean) => {
    const positions = right
      ? [v(x, 0, hd), v(x, 0, -hd), v(x, o.h, 0)]
      : [v(x, 0, -hd), v(x, 0, hd), v(x, o.h, 0)];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions.flatMap((p) => p.toArray()), 3),
    );
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([
      0, 0,
      1, 0,
      0.5, 1,
    ], 2));
    geo.setIndex([0, 1, 2]);
    geo.computeVertexNormals();
    g.add(shadowed(new THREE.Mesh(geo, o.gable)));
  };
  addGable(-hw, false);
  addGable(hw, true);

  if (o.ridge) {
    const cap = shadowed(
      new THREE.Mesh(new THREE.BoxGeometry(o.w + 0.12, 0.12, 0.18), o.ridge),
    );
    cap.position.y = o.h + 0.02;
    g.add(cap);
  }
  return g;
}

interface RoofBandOptions {
  /** 竖直徽标环带：宽 x 进深 x 带高 */
  w: number; d: number; h: number;
  front: THREE.Material;
  side: THREE.Material;
  back: THREE.Material;
  top: THREE.Material;
}

/**
 * mart/center 的屋顶环带。三视图正视中该段轮廓为全宽竖直边
 * （无向外倾斜角），因此是竖直棱柱而非外扩斜台——
 * 斜台会在角部产生外挑尖角和贴图扭曲。
 */
function roofBand(o: RoofBandOptions): THREE.Mesh {
  const geo = new THREE.BoxGeometry(o.w, o.h, o.d);
  // BoxGeometry 面顺序：+x -x +y -y +z -z。
  const mats = [o.side, o.side, o.top, o.top, o.front, o.back];
  return shadowed(new THREE.Mesh(geo, mats));
}


interface DomeRoofOptions {
  /** 半椭圆截面：a = 半宽（x），b = 高（y）；沿 -z 拉伸 length */
  a: number; b: number; length: number;
  front: THREE.Material;
  back: THREE.Material;
  side: THREE.Material;
  segments?: number;
}

/**
 * mart/center 顶端的小拱冠：半椭圆截面沿进深拉伸。
 * 前后端面用对应视图的拱弧裁切（裁切外接矩形与几何轮廓对齐，
 * 拱弧外的透明像素由 alphaTest 裁掉），曲面用侧视裁切按 v=sinθ 展开。
 * 局部原点在前端面底边中心，向 -z 延伸。
 */
function domeRoof(o: DomeRoofOptions): THREE.Group {
  const g = new THREE.Group();
  const N = o.segments ?? 16;

  // 曲面：左基线（θ=π）越顶到右基线（θ=0），该走向的三角化朝外。
  const positions: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  for (let i = 0; i <= N; i++) {
    const theta = Math.PI * (1 - i / N);
    const x = o.a * Math.cos(theta);
    const y = o.b * Math.sin(theta);
    positions.push(x, y, 0, x, y, -o.length);
    // 侧视图（右视）中建筑正面在画面左侧 → 前端 u=0
    uvs.push(0, Math.sin(theta), 1, Math.sin(theta));
  }
  for (let i = 0; i < N; i++) {
    const [f0, b0, f1, b1] = [2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 3];
    index.push(f0, f1, b1, f0, b1, b0);
  }
  const surf = new THREE.BufferGeometry();
  surf.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  surf.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  surf.setIndex(index);
  surf.computeVertexNormals();
  g.add(shadowed(new THREE.Mesh(surf, o.side)));

  // 前后端面：底边中心为扇心的半椭圆扇面
  const cap = (z: number, material: THREE.Material, facingFront: boolean) => {
    const pos: number[] = [0, 0, z];
    const uv: number[] = [0.5, 0];
    const idx: number[] = [];
    for (let i = 0; i <= N; i++) {
      // 前端面从右基线起逆时针（法线 +z）；后端面反向（法线 -z）
      const theta = facingFront ? (Math.PI * i) / N : Math.PI * (1 - i / N);
      const x = o.a * Math.cos(theta);
      const y = o.b * Math.sin(theta);
      pos.push(x, y, z);
      // 背视图按从建筑后方看绘制：从 -z 方向看去画面右侧是 -x，u 随 x 递减
      uv.push(facingFront ? x / (2 * o.a) + 0.5 : 0.5 - x / (2 * o.a), y / o.b);
      if (i > 0) idx.push(0, i, i + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    g.add(shadowed(new THREE.Mesh(geo, material)));
  };
  cap(0, o.front, true);
  cap(-o.length, o.back, false);
  return g;
}

/** 半椭圆拱冠的封闭投影代理；补上视觉薄壳不需要的底面。 */
function shadowProxyDome(a: number, b: number, length: number): THREE.Group {
  const proxy = domeRoof({
    a, b, length,
    front: shadowProxyMaterial,
    back: shadowProxyMaterial,
    side: shadowProxyMaterial,
  });
  proxy.add(quad(
    new THREE.Vector3(-a, 0, -length),
    new THREE.Vector3(a, 0, -length),
    new THREE.Vector3(a, 0, 0),
    new THREE.Vector3(-a, 0, 0),
    shadowProxyMaterial,
  ));
  return proxy;
}

/** 墙体盒：正面、左右侧面和背面分别使用三视图中的对应立面。 */
function wallBox(
  w: number, h: number, d: number,
  front: THREE.MeshLambertMaterial,
  side: THREE.MeshLambertMaterial,
  back: THREE.MeshLambertMaterial,
): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d);
  // BoxGeometry 面顺序：+x -x +y -y +z -z。
  const mats = [side, side, side, side, front, back];
  return shadowed(new THREE.Mesh(geo, mats));
}

export async function buildHouse(): Promise<THREE.Group> {
  const [
    mainRoofFront, awningRoofFront, ridge,
    mainGableSide, mainRoofBack, awningGableSide, awningRoofBack,
    wallFrontMat, wallSideMat, wallBackMat,
    upperFrontMat, upperSideMat, upperBackMat,
  ] =
    await Promise.all([
      loadPixelTexture(T + 'house-main-roof-front.png'),
      loadPixelTexture(T + 'house-awning-roof-front.png'),
      loadPixelTexture(T + 'house-ridge.png'),
      loadPixelTexture(T + 'house-main-gable-side.png'),
      loadPixelTexture(T + 'house-main-roof-back.png'),
      loadPixelTexture(T + 'house-awning-gable-side.png'),
      loadPixelTexture(T + 'house-awning-roof-back.png'),
      wallLambert('house-wall-front'),
      wallLambert('house-wall-side'),
      wallLambert('house-wall-back'),
      wallLambert('house-upper-front'),
      wallLambert('house-upper-side'),
      wallLambert('house-upper-back'),
    ]);

  const g = new THREE.Group();

  const wall = wallBox(4.75, 1.5, 3.4, wallFrontMat, wallSideMat, wallBackMat);
  wall.position.set(0, 0.75, -1.7);
  g.add(wall);

  const awningRoof = gableRoof({
    w: 5.4, d: 4.1, h: 0.55,
    front: lambert(awningRoofFront, 0.5),
    back: lambert(awningRoofBack, 0.5),
    gable: lambert(awningGableSide, 0.5),
    ridge: lambert(tiled(ridge)),
  });
  awningRoof.position.set(0, 1.42, -1.7);
  g.add(awningRoof);

  const upper = wallBox(4.0, 0.78, 3.1, upperFrontMat, upperSideMat, upperBackMat);
  upper.position.set(0, 2.24, -1.7);
  g.add(upper);

  const mainRoof = gableRoof({
    w: 4.9, d: 3.25, h: 1.15,
    front: lambert(mainRoofFront, 0.5),
    back: lambert(mainRoofBack, 0.5),
    gable: lambert(mainGableSide, 0.5),
    ridge: lambert(tiled(ridge)),
  });
  mainRoof.position.set(0, 2.58, -1.7);
  g.add(mainRoof);

  const proxy = new THREE.Group();
  proxy.add(
    shadowProxyBox(4.75, 1.5, 3.4, 0, 0.75, -1.7),
    shadowProxyBox(4.0, 0.78, 3.1, 0, 2.24, -1.7),
  );
  const awningProxy = shadowProxyGable(5.4, 4.1, 0.55);
  awningProxy.position.set(0, 1.42, -1.7);
  const mainRoofProxy = shadowProxyGable(4.9, 3.25, 1.15);
  mainRoofProxy.position.set(0, 2.58, -1.7);
  proxy.add(awningProxy, mainRoofProxy);
  return finalizeBuilding(g, proxy, 'house');
}

export async function buildLab(): Promise<THREE.Group> {
  const [roofFront, ridge, gableSide, roofBack, wallFrontMat, wallSideMat, wallBackMat] =
    await Promise.all([
      loadPixelTexture(T + 'lab-roof-front.png'),
      loadPixelTexture(T + 'lab-ridge.png'),
      loadPixelTexture(T + 'lab-gable-side.png'),
      loadPixelTexture(T + 'lab-roof-back.png'),
      wallLambert('lab-wall-front'),
      wallLambert('lab-wall-side'),
      wallLambert('lab-wall-back'),
    ]);

  const g = new THREE.Group();

  const wall = wallBox(6.8, 1.6, 4.0, wallFrontMat, wallSideMat, wallBackMat);
  wall.position.set(0, 0.8, -2.0);
  g.add(wall);

  const roofPrism = gableRoof({
    w: 7.5, d: 4.7, h: 1.15,
    front: lambert(tiled(roofFront), 0.5),
    back: lambert(tiled(roofBack), 0.5),
    gable: lambert(gableSide, 0.5),
    frontTile: { w: 3.75, h: 5.3 },
    backTile: { w: 2.75, h: 4.7 },
    ridge: lambert(tiled(ridge)),
  });
  roofPrism.position.set(0, 1.55, -2.0);
  g.add(roofPrism);

  // 圆盘天线：底座 + 外环 + 内孔，立在屋顶坡面上
  const dish = new THREE.Group();
  const grayMat = (c: number) => new THREE.MeshLambertMaterial({ color: c });
  const base = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.14, 1.1), grayMat(0x8b6840)));
  base.position.y = 0;
  const outer = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 0.42, 20), grayMat(0x9090a0)));
  outer.position.y = 0.26;
  const inner = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.44, 16), grayMat(0x3c3c46)));
  inner.position.y = 0.28;
  dish.add(base, outer, inner);
  // 落在前坡左侧，底座高度按三视图中的中央屋脊坡面计算。
  dish.position.set(-1.5, 2.53, -1.5);
  g.add(dish);

  const proxy = new THREE.Group();
  proxy.add(shadowProxyBox(6.8, 1.6, 4.0, 0, 0.8, -2.0));
  const roofProxy = shadowProxyGable(7.5, 4.7, 1.15);
  roofProxy.position.set(0, 1.55, -2.0);
  const dishProxy = new THREE.Group();
  dishProxy.position.copy(dish.position);
  const dishBodyProxy = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.62, 0.44, 12),
    shadowProxyMaterial,
  );
  dishBodyProxy.position.y = 0.28;
  dishProxy.add(
    shadowProxyBox(1.1, 0.14, 1.1, 0, 0, 0),
    dishBodyProxy,
  );
  proxy.add(roofProxy, dishProxy);
  return finalizeBuilding(g, proxy, 'lab');
}

/**
 * 古辰镇住宅：山墙两坡顶（正/侧视一致的屋型），墙体矩形核心 + 大挑檐。
 * 比例由三视图像素直接换算：墙宽 234px ↔ 4.0 世界单位（1px ≈ 0.0171），
 * 墙高 94px → 1.6，屋脊高 110px → 1.88，屋面含 257px 挑檐宽 → 4.4。
 * 背视图被画成了四坡顶（与正/侧视矛盾），背坡直接复用正坡贴图保持山墙顶一致。
 */
export async function buildOldaleHouse(): Promise<THREE.Group> {
  const [
    roofFrontTex, ridgeTex,
    gableSideMat, wallFrontMat, wallSideMat, wallBackMat,
  ] = await Promise.all([
    loadPixelTexture(T + 'oldale-house-roof-front.png'),
    loadPixelTexture(T + 'oldale-house-ridge.png'),
    // 山墙三角里有侧窗，走 wallLambert 接入夜间窗光
    wallLambert('oldale-house-gable-side'),
    wallLambert('oldale-house-wall-front'),
    wallLambert('oldale-house-wall-side'),
    wallLambert('oldale-house-wall-back'),
  ]);
  const g = new THREE.Group();
  const wall = wallBox(4.0, 1.6, 3.5, wallFrontMat, wallSideMat, wallBackMat);
  wall.position.set(0, 0.8, -1.75);
  const roofSlope = lambert(roofFrontTex, 0.5);
  const roof = gableRoof({
    w: 4.4, d: 4.06, h: 1.88,
    front: roofSlope,
    back: roofSlope,
    gable: gableSideMat,
    ridge: lambert(tiled(ridgeTex)),
  });
  // 屋面正视含 10px 檐口封板，压低基线让封板带遮住墙顶接缝
  roof.position.set(0, 1.57, -1.75);
  g.add(wall, roof);

  const proxy = new THREE.Group();
  proxy.add(shadowProxyBox(4.0, 1.6, 3.5, 0, 0.8, -1.75));
  const roofProxy = shadowProxyGable(4.4, 4.06, 1.88);
  roofProxy.position.set(0, 1.57, -1.75);
  proxy.add(roofProxy);
  return finalizeBuilding(g, proxy, 'oldale-house');
}

/**
 * mart/center 共用造型。正面剪影严格对齐 Meowa 生成的纯水平视角立面图
 * （assets/runtime-source/buildings/oldale-*-front-elevation.png）：
 * 墙体盒 → 竖直徽标环带（正面精灵球）→ 平顶（平铺等角图的条纹顶面，
 * 该条纹区在 ¾ 视角原图里本就是俯视才可见的顶面）→ 顶端小拱冠。
 * 各段世界尺寸 = 立面图像素 × (4.0 / 墙宽像素)；剪影之外不建任何体积。
 */
async function buildOldaleCivic(kind: 'mart' | 'center'): Promise<THREE.Group> {
  const prefix = `oldale-${kind}`;
  const [
    bandFrontTex, bandSideTex, bandBackTex,
    crownFrontTex, crownSideTex, crownBackTex, topTex,
    wallFrontMat, wallSideMat, wallBackMat,
  ] = await Promise.all([
    loadPixelTexture(`${T}${prefix}-band-front.png`),
    loadPixelTexture(`${T}${prefix}-band-side.png`),
    loadPixelTexture(`${T}${prefix}-band-back.png`),
    loadPixelTexture(`${T}${prefix}-crown-front.png`),
    loadPixelTexture(`${T}${prefix}-crown-side.png`),
    loadPixelTexture(`${T}${prefix}-crown-back.png`),
    loadPixelTexture(`${T}${prefix}-top.png`),
    wallLambert(`${prefix}-wall-front`),
    wallLambert(`${prefix}-wall-side`),
    wallLambert(`${prefix}-wall-back`),
  ]);
  // 立面图换算（1px = 4.0 / 墙宽像素）：center 167px、mart 245px。
  // 进深取侧视与俯视贴图换算的折中 3.55（center 3.26/3.82、mart 3.93/3.18，
  // 两图自身不完全一致），各面贴图失真 ≤10%；拱冠长度 3.0 与侧视拱条
  // 及俯视拱冠条（换算 ≈2.8-3.2）一致。
  const wallD = 3.55;
  const zc = -wallD / 2;
  // 墙体为完整盒体（用户确认）；正面立面图重生成为与背面一致的直墙矩形。
  const dims = kind === 'mart'
    ? { wallH: 1.42, bandW: 4.06, bandH: 1.06, crownA: 0.94, crownB: 0.46, crownL: 3.0 }
    : { wallH: 1.49, bandW: 4.14, bandH: 1.1, crownA: 0.95, crownB: 0.46, crownL: 3.0 };
  const g = new THREE.Group();

  const wall = wallBox(4.0, dims.wallH, wallD, wallFrontMat, wallSideMat, wallBackMat);
  wall.position.set(0, dims.wallH / 2, zc);
  g.add(wall);

  // 环带顶角圆角是透明像素，alphaTest 裁掉后会露出内部；内衬描边色内芯。
  const coreMat = new THREE.MeshLambertMaterial({
    color: kind === 'mart' ? 0x212133 : 0x2d2e42,
  });

  // 平顶整幅铺 Meowa 正俯视图（图像底边 = 建筑正面，与 BoxGeometry +y 面
  // 的 UV 朝向一致）；中央画出的拱冠俯视条被 3D 拱冠盖住。
  const bandD = wallD + (dims.bandW - 4.0);
  const band = roofBand({
    w: dims.bandW, d: bandD, h: dims.bandH,
    front: lambert(bandFrontTex, 0.5),
    side: lambert(bandSideTex, 0.5),
    back: lambert(bandBackTex, 0.5),
    top: lambert(topTex),
  });
  // 环带底沿压过墙顶 0.02 遮住接缝
  band.position.set(0, dims.wallH - 0.02 + dims.bandH / 2, zc);
  g.add(band);

  // 内芯顶面收进 0.02，避免与俯视贴图顶面共面闪烁。
  const bandCore = new THREE.Mesh(
    new THREE.BoxGeometry(dims.bandW - 0.08, dims.bandH - 0.02, bandD - 0.08), coreMat,
  );
  bandCore.position.set(0, band.position.y - 0.01, zc);
  g.add(bandCore);

  const crown = domeRoof({
    a: dims.crownA, b: dims.crownB, length: dims.crownL,
    front: lambert(crownFrontTex, 0.5),
    back: lambert(crownBackTex, 0.5),
    side: lambert(crownSideTex),
  });
  crown.position.set(0, dims.wallH + dims.bandH - 0.04, zc + dims.crownL / 2);
  g.add(crown);

  const proxy = new THREE.Group();
  proxy.add(shadowProxyBox(4.0, dims.wallH, wallD, 0, dims.wallH / 2, zc));
  proxy.add(shadowProxyBox(
    dims.bandW, dims.bandH, bandD,
    0, band.position.y, zc,
  ));
  const crownProxy = shadowProxyDome(dims.crownA, dims.crownB, dims.crownL);
  crownProxy.position.copy(crown.position);
  proxy.add(crownProxy);
  return finalizeBuilding(g, proxy, `oldale-${kind}`);
}

export const buildOldaleMart = (): Promise<THREE.Group> => buildOldaleCivic('mart');
export const buildOldaleCenter = (): Promise<THREE.Group> => buildOldaleCivic('center');

/**
 * 牌子：前后两张牌面 + 按透明像素外轮廓生成的实体侧壁。
 * 视觉上有纸片叠出的厚度，但不会真的堆叠许多透明面片。
 */
export async function buildSign(): Promise<THREE.Group> {
  const tex = await loadPixelTexture('assets/sprites/props/sign.png');
  const material = new THREE.MeshLambertMaterial({
    map: tex,
    alphaTest: 0.5,
  });

  const depth = 0.22;
  const geometry = extrudePixelSpriteGeometry(tex, {
    width: 1,
    height: 1,
    depth,
    alphaTest: 0.5,
  });
  const mesh = shadowed(new THREE.Mesh(geometry, material));
  mesh.position.set(0, 0.5 + 0.01, -0.5);
  const g = new THREE.Group();
  g.add(mesh);
  return g;
}
