import type { FurnitureBox, MapData, MapWarp } from '../MapData';

/**
 * 未白镇对手家（May 家）室内（1F 11x9、2F 9x8），玩家家的水平镜像布局。
 * tile 坐标与 pret/pokeemerald 反编译数据一致，warp 点照抄原作：
 * 1F 门垫 (1,8)/(2,8) 出镇、楼梯 (2,2) 上楼；2F 楼梯口 (1,1) 下楼。
 *
 * 素材来自 assets/runtime-source/interiors/rival-house 的 Meowa 最终部件；家具为立体盒
 * （HD-2D，与玩家家同法）：顶面/正面贴图来自 sprites/parts/*.png 部件
 * 切图，占地/高度按 16px=1 单位从像素折算（manifest bboxTiles）。
 */

const BASE = 'assets/interiors/rival-house';
const P = `${BASE}/sprites/parts`;

function parseCollision(rows: string[]): number[][] {
  return rows.map((row) => [...row].map((cell) => (cell === '#' ? 1 : 0)));
}

// 墙后区域整体封死仅留楼梯格；家具占格进碰撞（实体盒防穿模）。
const COLLISION_1F = parseCollision([
  '###########',
  '###########',
  '##.########', // (2,2) 上楼梯口
  '......#####', // 厨房一列（柜体站在墙前 row3）
  '......###..', // 游戏主机 + 电视桌
  '...........',
  '.....####..', // 餐桌 + 两侧椅子
  '.....####..',
  '...........', // (1,8)/(2,8) 门垫
]);

const COLLISION_2F = parseCollision([
  '#########',
  '#.#######', // (1,1) 下楼梯口
  '....##.##', // 电视+沙发、玩偶、书桌+置物柜+椅
  '......###', // 床（含床头板行）
  '......###',
  '......###',
  '.........',
  '.........',
]);

/** 墙体外观（两层共用，与玩家家同款奶油色） */
const WALL = {
  height: 3,
  thickness: 0.3,
  sideTexture: `${BASE}/wall-side.png`,
  capColor: 0xf2ead8,
  baseColor: 0xcfc7b2,
};

const CHAIR_GREEN = 0x8cd046;
const CHAIR_FRAME = 0x39405e;

function chair(x: number, z: number, backAtEast: boolean): FurnitureBox[] {
  const seat: FurnitureBox = {
    x, z, w: 0.78, d: 0.78, h: 0.45,
    top: `${P}/chair-seat.png`, color: CHAIR_GREEN, sideTint: 0xd8d8d8,
  };
  const back: FurnitureBox = {
    x: backAtEast ? x + 0.78 : x - 0.16, z, w: 0.16, d: 0.78, h: 1.05,
    color: CHAIR_FRAME,
  };
  return [seat, back];
}

/** 餐桌：桌板 + 四腿（镜像位置，样式与玩家家一致） */
function diningTable(): FurnitureBox[] {
  const legs: FurnitureBox[] = (
    [[6.28, 6.15], [7.62, 6.15], [6.28, 7.55], [7.62, 7.55]] as const
  ).map(([x, z]) => ({ x, z, w: 0.24, d: 0.24, h: 0.62, color: 0xb08a4f }));
  return [
    {
      x: 6.05, z: 6.05, w: 1.9, d: 1.85, h: 0.2, y: 0.62,
      top: `${P}/table-top.png`, front: `${P}/table-skirt.png`,
      color: 0xb08a4f,
    },
    ...legs,
  ];
}

const FURNITURE_1F: FurnitureBox[] = [
  // 厨房一列：玻璃柜 + 水槽灶台 + 冰箱，站在北墙内侧面（z=3）前，占 row3
  {
    name: 'cabinet', x: 6.58, z: 3.02, w: 1.3, d: 0.85, h: 1.5,
    top: `${P}/cabinet-top.png`, front: `${P}/cabinet-front.png`, color: 0xa8925f,
  },
  {
    name: 'counter', x: 7.95, z: 3.02, w: 2.0, d: 0.8, h: 0.72,
    top: `${P}/counter-top.png`, front: `${P}/counter-front.png`, color: 0x9a8f78,
  },
  {
    name: 'fridge', x: 9.98, z: 3.02, w: 0.97, d: 0.85, h: 1.62,
    top: `${P}/fridge-top.png`, front: `${P}/fridge-front.png`, color: 0xbfc4c6,
  },
  // 游戏主机（洗衣机造型，带小蓝游戏机）+ 白色电视桌（row4）
  {
    name: 'tv-unit', x: 6.02, z: 3.95, w: 0.95, d: 0.62, h: 0.95,
    top: `${P}/tvunit-top.png`, front: `${P}/tvunit-front.png`, color: 0x8d949e,
  },
  {
    name: 'console', x: 6.06, z: 4.6, w: 0.88, d: 0.38, h: 0.3,
    front: `${P}/console1f-front.png`, color: 0x9cb8d8,
  },
  {
    name: 'tv-table', x: 6.98, z: 4.15, w: 2.0, d: 0.85, h: 0.42,
    top: `${P}/tvtable-top.png`, front: `${P}/tvtable-front.png`, color: 0xd8d4c8,
  },
  // 餐桌 + 四椅（rows 6-7；椅背朝外）
  ...diningTable(),
  ...chair(5.15, 6.12, false),
  ...chair(5.15, 7.12, false),
  ...chair(8.06, 6.12, true),
  ...chair(8.06, 7.12, true),
];

const FURNITURE_2F: FurnitureBox[] = [
  // 电视角（贴北墙）：电视 + 前排蓝色双人座 + 站立玩偶
  {
    name: 'tv', x: 4.0, z: 2.02, w: 0.95, d: 0.4, h: 1.15,
    front: `${P}/tv2f-front.png`, color: 0x4a4e58,
  },
  {
    name: 'couch', x: 4.02, z: 2.46, w: 1.0, d: 0.48, h: 0.4,
    top: `${P}/couch-top.png`, color: 0x9cc4e8, sideTint: 0xd8d8d8,
  },
  {
    name: 'doll', x: 5.25, z: 2.05, w: 0.72, d: 0.35, h: 0.95,
    front: `${P}/doll-front.png`, color: 0xd9822b,
  },
  // 书桌角（贴北墙）：笔记本书桌 + 高置物柜 + 紫色方凳
  {
    name: 'desk', x: 6.98, z: 2.02, w: 1.1, d: 0.85, h: 0.76,
    top: `${P}/desk-top.png`, front: `${P}/desk-front.png`, color: 0xdad6ca,
  },
  {
    name: 'shelf', x: 8.02, z: 2.02, w: 0.93, d: 0.45, h: 1.5,
    top: `${P}/shelf-top.png`, front: `${P}/shelf-front.png`, color: 0xd6d2c4,
  },
  {
    name: 'stool', x: 8.12, z: 2.52, w: 0.72, d: 0.45, h: 0.6,
    front: `${P}/chair2f-front.png`, color: 0xa98fd0,
  },
  // 床：床头板 + 床垫（rows 4-5，含床脚）
  { name: 'bed-head', x: 6.78, z: 3.84, w: 1.6, d: 0.18, h: 0.85, color: 0x8a8fa8 },
  {
    name: 'bed', x: 6.78, z: 4.0, w: 1.6, d: 1.86, h: 0.48,
    top: `${P}/bed-top.png`, front: `${P}/bed-front.png`, color: 0xd8dae6,
  },
];

const EXIT_TO_TOWN: Omit<MapWarp, 'x' | 'y'> = {
  dest: 'littleroot',
  destX: 16,
  destY: 49,
  destFacing: 'down',
};

export const RIVAL_HOUSE_1F: MapData = {
  id: 'rival-house-1f',
  width: 11,
  height: 9,
  groundTexture: `${BASE}/floor-1f.png`,
  collision: COLLISION_1F,
  props: [],
  npcs: [{
    id: 'rival-mom',
    name: '邻居阿姨',
    texture: 'assets/sprites/npcs/woman-4.png',
    idleAnimation: {
      texture: 'assets/sprites/npcs/woman-4-idle-spritesheet.png',
      columns: 2,
      rows: 2,
      frames: 4,
      fps: 4,
      facing: 'down',
    },
    dialogue: [
      '欢迎你！我家孩子正在楼上整理研究笔记。',
      '上去打个招呼吧，应该会很高兴认识新邻居。',
    ],
    x: 5, y: 5, facing: 'down',
  }],
  spawn: { x: 2, y: 8, facing: 'up' },
  cameraDistance: 9,
  background: 0x1a1512,
  interior: {
    floor: { x: 0, y: 2, width: 11, height: 7 },
    wall: { ...WALL, northZ: 3, northTexture: `${BASE}/wall-1f.png` },
    furniture: FURNITURE_1F,
  },
  warps: [
    { x: 1, y: 8, ...EXIT_TO_TOWN },
    { x: 2, y: 8, ...EXIT_TO_TOWN },
    {
      x: 2, y: 2,
      dest: 'rival-house-2f', destX: 1, destY: 2, destFacing: 'down',
    },
  ],
};

export const RIVAL_HOUSE_2F: MapData = {
  id: 'rival-house-2f',
  width: 9,
  height: 8,
  groundTexture: `${BASE}/floor-2f.png`,
  collision: COLLISION_2F,
  props: [],
  npcs: [{
    id: 'rival',
    name: '小遥',
    texture: 'assets/sprites/npcs/may.png',
    idleAnimation: {
      texture: 'assets/sprites/npcs/may-idle-spritesheet.png',
      columns: 2,
      rows: 2,
      frames: 4,
      fps: 4,
      facing: 'down',
    },
    dialogue: [
      '咦，你就是刚搬来的邻居？',
      '我叫小遥，正在帮爸爸调查野生宝可梦。',
      '抱歉，我得先去野外做记录。下次再聊！',
    ],
    interactionId: 'meet-rival',
    visibleDuring: ['visit_rival'],
    x: 5, y: 3, facing: 'down',
  }],
  spawn: { x: 1, y: 2, facing: 'down' },
  cameraDistance: 9,
  background: 0x1a1512,
  interior: {
    floor: { x: 0, y: 1, width: 9, height: 7 },
    wall: { ...WALL, northZ: 2, northTexture: `${BASE}/wall-2f.png` },
    furniture: FURNITURE_2F,
  },
  interactions: [{ id: 'rival-pokeball', x: 7, y: 1, phases: ['visit_rival'] }],
  warps: [
    {
      x: 1, y: 1,
      dest: 'rival-house-1f', destX: 2, destY: 3, destFacing: 'down',
    },
  ],
};
