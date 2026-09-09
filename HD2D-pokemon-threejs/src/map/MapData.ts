import type { SpeciesId } from '../story/GameSession';

/**
 * 地图数据接口。当前由手写数据（littleroot.ts）提供，
 * 后续若改用 Tiled 编辑器只需写一个 .tmj 解析器产出同样的结构。
 */
export type PropKind =
  | 'tree' | 'flower' | 'tallGrass'
  | 'house' | 'lab' | 'oldaleHouse' | 'oldaleMart' | 'oldaleCenter'
  | 'sign';

export interface MapProp {
  kind: PropKind;
  /** 精灵底边中心所在 tile（x 为左端 tile；宽度大于 1 时取跨度） */
  x: number;
  y: number;
  /** 占地宽度（tile 数），精灵水平居中于该跨度 */
  width: number;
}

export interface DualGridTerrain {
  /** 256x256、4x4 排列的 64px dual-grid atlas。 */
  texture: string;
  /** 被浅色地貌填充的逻辑地图格。 */
  filledCells: Array<[number, number]>;
}

export interface GroundOverlay {
  /** 与整张地图同尺寸的透明像素图层。 */
  texture: string;
  /** 大于 0 时按 alpha 轮廓向上挤出，形成封闭的像素地形。 */
  height?: number;
}

export interface MapNpc {
  id: string;
  /** 对话框左上角显示的角色名。 */
  name: string;
  texture: string;
  /** 与 NPC 面对面按空格时依次显示的中文对话页。 */
  dialogue: string[];
  /** 剧情角色可交给 StoryDirector，而非直接显示静态 dialogue。 */
  interactionId?: string;
  /** 仅在这些剧情阶段显示；缺省表示始终显示。 */
  visibleDuring?: string[];
  /**
   * walk9: 9 个 16x32 帧；walk9Wide: 9 个 32x32 帧；
   * static: 单帧透明图。
   */
  spriteLayout?: 'walk9' | 'walk9Wide' | 'static';
  /** 原地站立时播放的独立透明图集；facing 限制生成素材对应的屏幕朝向。 */
  idleAnimation?: {
    texture: string;
    columns: number;
    rows: number;
    frames: number;
    fps: number;
    facing: 'down' | 'up' | 'left' | 'right';
  };
  /** 覆盖默认 1x2 世界尺寸，例如 32x32 宝可梦为 2x2、背包为 1x1。 */
  spriteWorldSize?: [width: number, height: number];
  /** 缺省会占据碰撞格；纯演出角色可关闭。 */
  blocksMovement?: boolean;
  /** 围绕 (x, y) 持续运动的剧情演出。 */
  orbit?: {
    radiusX: number;
    radiusY: number;
    periodSeconds: number;
    startAngle?: number;
  };
  x: number;
  y: number;
  facing: 'down' | 'up' | 'left' | 'right';
  wander?: {
    /** 可活动矩形（含边界），NPC 每次只连续走少量格子。 */
    bounds: [minX: number, minY: number, maxX: number, maxY: number];
    maxWalkSteps: number;
    pauseSeconds: [min: number, max: number];
  };
}

export interface MapInteraction {
  id: string;
  x: number;
  y: number;
  /** 可交互的剧情阶段；缺省表示不限制。 */
  phases?: string[];
}

export interface MapStepTrigger {
  id: string;
  x: number;
  y: number;
  phases?: string[];
  once?: boolean;
}

export interface WildEncounterTable {
  /** 会进行遭遇判定的地图格。 */
  cells: Array<[number, number]>;
  /** 每走入一格草丛时的遭遇概率，范围 0..1。 */
  encounterRate: number;
  /** 遭遇后至少走过的草丛格数，避免刚返回地图就连续开战。 */
  cooldownSteps: number;
  entries: Array<{
    species: SpeciesId;
    minLevel: number;
    maxLevel: number;
    weight: number;
  }>;
}

export type BattleArenaKind = 'forest' | 'interior' | 'cave' | 'special';

export interface MapBattleConfig {
  /** 默认战斗布景；未填写时室内自动为 interior，室外自动为 forest。 */
  kind: BattleArenaKind;
  /** 经过美术确认的世界坐标候选点；缺省时从玩家附近碰撞网格搜索。 */
  centers?: Array<[x: number, z: number]>;
}

/** 踏上 (x, y) 触发的传送：淡出 → 切地图 → 在目的格淡入。 */
export interface MapWarp {
  x: number;
  y: number;
  /** 目标地图 id（见 maps.ts 注册表） */
  dest: string;
  destX: number;
  destY: number;
  destFacing: 'down' | 'up' | 'left' | 'right';
}

/**
 * 立体家具盒：BoxGeometry 按面贴图。
 * top/front 缺省的面用 color 纯色；侧面复用 front 贴图并乘 sideTint 压暗。
 */
export interface FurnitureBox {
  kind?: 'box';
  /** 场景树中的可审计零件名。 */
  name?: string;
  /** 占地矩形（tile 坐标，含小数）：x/z 为西北角，w/d 为宽深 */
  x: number;
  z: number;
  w: number;
  d: number;
  /** 高度（世界单位） */
  h: number;
  /** 底面抬升（叠放用，如桌上的电视），默认 0 */
  y?: number;
  /** 顶面贴图 URL */
  top?: string;
  /** 南面（面向相机）贴图 URL */
  front?: string;
  /** 无贴图面的纯色（默认深木色） */
  color?: number;
  /** 侧面复用 front 贴图时的乘色，默认 0xb8b8b8 */
  sideTint?: number;
  /** 不受场景灯光影响的自发光零件（电视屏幕、亮窗玻璃等）。 */
  unlit?: boolean;
  /** 自发光表面的动态闪烁与扫描亮带。 */
  glow?: {
    speed: number;
    strength: number;
  };
  /** 围绕盒体中心旋转，用于斜放书本、植物叶片等。 */
  rotationX?: number;
  rotationY?: number;
  rotationZ?: number;
}

/** 一个可单独检查/摆放的完整家具，由多个基础几何零件组成。 */
export interface FurnitureGroup {
  kind: 'group';
  name: string;
  children: InteriorFurniture[];
}

/** 室内局部照明；spot 会朝 target 指定的位置投光。 */
export interface FurnitureLight {
  kind: 'light';
  name: string;
  lightType: 'point' | 'spot';
  x: number;
  y: number;
  z: number;
  color: number;
  intensity: number;
  distance: number;
  decay?: number;
  target?: { x: number; y: number; z: number };
  angle?: number;
  penumbra?: number;
  /** 局部灯光在两个强度之间持续呼吸。 */
  pulse?: {
    minIntensity: number;
    maxIntensity: number;
    speed: number;
  };
}

/** 低成本的柔边地面投光，用来表现窗框切出的长方形日照。 */
export interface FurnitureLightPatch {
  kind: 'lightPatch';
  name: string;
  /** 光斑中心。 */
  x: number;
  z: number;
  w: number;
  d: number;
  y?: number;
  color: number;
  opacity: number;
  rotationY?: number;
  feather?: number;
}

/** GPU 漂浮的室内空气微粒：只占一个 draw call。 */
export interface FurnitureDust {
  kind: 'dust';
  name: string;
  count: number;
  x: number;
  z: number;
  w: number;
  d: number;
  minY: number;
  maxY: number;
  color: number;
  size: number;
  opacity: number;
}

/** 圆形研究设备：圆柱侧面/顶面可分别使用像素贴图。 */
export interface FurnitureCylinder {
  kind: 'cylinder';
  name?: string;
  /** 圆心所在 tile 坐标 */
  x: number;
  z: number;
  radius: number;
  radiusTop?: number;
  radiusBottom?: number;
  h: number;
  y?: number;
  top?: string;
  front?: string;
  color?: number;
  /** 保持低多边形轮廓，默认 16 段。 */
  segments?: number;
  rotationX?: number;
  rotationY?: number;
  rotationZ?: number;
}

/** 透明像素植物等薄物件：两张正交面组成，兼顾相机旋转。 */
export interface FurnitureSprite {
  kind: 'sprite';
  name?: string;
  /** 精灵底边中心所在 tile 坐标 */
  x: number;
  z: number;
  w: number;
  h: number;
  texture: string;
  y?: number;
}

export type InteriorFurniture =
  | FurnitureBox
  | FurnitureCylinder
  | FurnitureSprite
  | FurnitureGroup
  | FurnitureLight
  | FurnitureLightPatch
  | FurnitureDust;

/**
 * 室内场景描述（由 InteriorBuilder 构建）：
 * 地板矩形 + 带厚度的北墙/侧墙盒体（顶部亮色收边、南端露横截面）+
 * 立体家具盒。南侧不设墙，避免遮挡默认从南向北看的相机。
 */
export interface InteriorSpec {
  /** 地板贴图（map.groundTexture）覆盖的 tile 矩形 */
  floor: { x: number; y: number; width: number; height: number };
  wall: {
    /** 墙高（世界单位） */
    height: number;
    /** 墙体厚度（世界单位） */
    thickness: number;
    /** 北墙内侧面所在 z */
    northZ: number;
    /** 北墙内侧贴图（窗/楼梯口等已烘焙） */
    northTexture: string;
    /** 侧墙内侧 1 tile 宽条带贴图，沿纵深平铺 */
    sideTexture: string;
    /** 墙顶收边与南端横截面颜色 */
    capColor: number;
    /** 墙体其余面的底色 */
    baseColor: number;
  };
  furniture: InteriorFurniture[];
}

export interface MapData {
  /** 注册表 key（maps.ts），warp 以它寻址 */
  id: string;
  /** 地图尺寸（tile） */
  width: number;
  height: number;
  /** 地面纹理 URL（整图；室内地图为地板矩形贴图） */
  groundTexture: string;
  /** 运行时直接采样的 dual-grid 地貌层。 */
  dualGridTerrain?: DualGridTerrain;
  /** 覆盖在地貌层上方的整图透明像素层，可选择按轮廓挤出。 */
  groundOverlays?: GroundOverlay[];
  /** 碰撞网格：collision[y][x] === 1 表示不可通行 */
  collision: number[][];
  props: MapProp[];
  /** NPC；无 wander 时固定站立，所有 NPC 所在格均注册为动态阻挡。 */
  npcs: MapNpc[];
  /** 面向目标格按确认触发的调查点。 */
  interactions?: MapInteraction[];
  /** 玩家完整停在目标格时触发的剧情点。 */
  stepTriggers?: MapStepTrigger[];
  /** 野外草丛的随机遭遇表。 */
  wildEncounters?: WildEncounterTable;
  battle?: MapBattleConfig;
  spawn: { x: number; y: number; facing: 'down' | 'up' | 'left' | 'right' };
  /** 室内地图：走 InteriorBuilder，不挂室外天候特效（昼夜/萤火虫/光柱） */
  interior?: InteriorSpec;
  warps?: MapWarp[];
  /** 相机距离覆盖（小房间拉近视角） */
  cameraDistance?: number;
  /** 场景背景色覆盖（室内暗色；室外由 DayNight 每帧驱动） */
  background?: number;
}
