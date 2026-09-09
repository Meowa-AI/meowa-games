import type {
  FurnitureBox, FurnitureGroup, InteriorFurniture, MapData, MapWarp,
} from '../MapData';

/**
 * 未白镇玩家家室内（1F 11x9、2F 9x8）。
 * tile 坐标与 pret/pokeemerald 反编译数据完全一致，warp 点照抄原作：
 * 1F 门垫 (8,8)/(9,8) 出镇、楼梯 (8,2) 上楼；2F 楼梯口 (7,1) 下楼。
 *
 * 家具为立体盒（HD-2D）：顶面/正面贴图由
 * assets/runtime-source/interiors/player-house 保存 Meowa 最终部件
 * （sprites/parts/*.png），占地/高度按 16px=1 单位从像素折算。
 */

const BASE = 'assets/interiors/player-house';
const P = `${BASE}/sprites/parts`;

/** 碰撞行：'#' 不可走。墙后区域整体封死，仅楼梯格放行。 */
function parseCollision(rows: string[]): number[][] {
  return rows.map((row) => [...row].map((cell) => (cell === '#' ? 1 : 0)));
}

// 基于 pret 碰撞位，另按 HD-2D 场景补挡：墙后区域全封（原作 0..1 行
// 是俯视墙带）、餐椅与床占格（原作靠图层优先级让人物“藏”在家具后，
// 这里家具是实体盒，走进去会穿模）。
const COLLISION_1F = parseCollision([
  '###########',
  '###########',
  '########.##', // (8,2) 上楼梯口
  '#####......', // 厨房一列（立体柜体站在墙前 row3）
  '..###......', // 电视桌 + 游戏机
  '...........',
  '..####.....', // 餐桌 + 两侧椅子
  '..####.....',
  '...........', // (8,8)/(9,8) 门垫
]);

const COLLISION_2F = parseCollision([
  '#########',
  '#######.#', // (7,1) 下楼梯口
  '##.......', // 矮桌(0-1)；其余墙前空地可走
  '#........', // (0,3) 转椅
  '.##......', // 床
  '.##......',
  '.........',
  '.........',
]);

/** 墙体外观（两层共用）：奶油色墙 + 亮色顶部收边 */
const WALL = {
  height: 3,
  thickness: 0.3,
  sideTexture: `${BASE}/wall-side.png`,
  capColor: 0xf2ead8,
  baseColor: 0xcfc7b2,
};

const CHAIR_FRAME = 0x39405e;

function group(name: string, children: InteriorFurniture[]): FurnitureGroup {
  return { kind: 'group', name, children };
}

function windowModel(name: string, x: number): FurnitureGroup {
  const frame = 0x334661;
  return group(name, [
    { name: `${name}-glass`, x: x + 0.08, z: 3.004, w: 0.76, d: 0.035, h: 0.68, y: 1.72, color: 0x9feeff, unlit: true },
    { name: `${name}-frame-left`, x, z: 3.01, w: 0.08, d: 0.055, h: 0.84, y: 1.64, color: frame },
    { name: `${name}-frame-right`, x: x + 0.84, z: 3.01, w: 0.08, d: 0.055, h: 0.84, y: 1.64, color: frame },
    { name: `${name}-frame-top`, x, z: 3.01, w: 0.92, d: 0.055, h: 0.08, y: 2.4, color: frame },
    { name: `${name}-frame-bottom`, x, z: 3.01, w: 0.92, d: 0.055, h: 0.08, y: 1.64, color: frame },
    { name: `${name}-mullion`, x: x + 0.43, z: 3.045, w: 0.06, d: 0.035, h: 0.68, y: 1.72, color: 0xe9f7f2 },
  ]);
}

function sideWindowModel(): FurnitureGroup {
  const name = 'window-east-wall';
  const frame = 0x334661;
  return group(name, [
    { name: `${name}-glass`, x: 10.958, z: 6.12, w: 0.035, d: 1.0, h: 0.72, y: 1.5, color: 0xb9f5ff, unlit: true },
    { name: `${name}-frame-north`, x: 10.93, z: 6.03, w: 0.065, d: 0.09, h: 0.88, y: 1.42, color: frame },
    { name: `${name}-frame-south`, x: 10.93, z: 7.12, w: 0.065, d: 0.09, h: 0.88, y: 1.42, color: frame },
    { name: `${name}-frame-top`, x: 10.93, z: 6.03, w: 0.065, d: 1.18, h: 0.08, y: 2.22, color: frame },
    { name: `${name}-frame-bottom`, x: 10.93, z: 6.03, w: 0.065, d: 1.18, h: 0.08, y: 1.42, color: frame },
    { name: `${name}-mullion`, x: 10.925, z: 6.58, w: 0.07, d: 0.06, h: 0.72, y: 1.5, color: 0xe9f7f2 },
  ]);
}

function diningChair(name: string, x: number, z: number, backAtEast: boolean): FurnitureGroup {
  const backX = backAtEast ? x + 0.7 : x - 0.14;
  return group(name, [
    { name: `${name}-seat`, x, z, w: 0.7, d: 0.7, h: 0.16, y: 0.42, top: `${P}/chair-seat.png`, color: 0x47b8d5 },
    { name: `${name}-back`, x: backX, z, w: 0.14, d: 0.7, h: 1.0, color: CHAIR_FRAME },
    { name: `${name}-leg-north-west`, x: x + 0.06, z: z + 0.06, w: 0.1, d: 0.1, h: 0.42, color: CHAIR_FRAME },
    { name: `${name}-leg-north-east`, x: x + 0.54, z: z + 0.06, w: 0.1, d: 0.1, h: 0.42, color: CHAIR_FRAME },
    { name: `${name}-leg-south-west`, x: x + 0.06, z: z + 0.54, w: 0.1, d: 0.1, h: 0.42, color: CHAIR_FRAME },
    { name: `${name}-leg-south-east`, x: x + 0.54, z: z + 0.54, w: 0.1, d: 0.1, h: 0.42, color: CHAIR_FRAME },
  ]);
}

function diningTable(): FurnitureGroup {
  return group('dining-table', [
    { kind: 'cylinder', name: 'dining-table-top', x: 3.93, z: 6.96, radius: 1.06, h: 0.18, y: 0.65, color: 0x338a35, segments: 8 },
    ...([[3.18, 6.26], [4.5, 6.26], [3.18, 7.5], [4.5, 7.5]] as const)
      .map(([x, z], i): FurnitureBox => ({ name: `dining-table-leg-${i + 1}`, x, z, w: 0.22, d: 0.22, h: 0.65, color: 0x7b512d })),
  ]);
}

const FURNITURE_1F: InteriorFurniture[] = [
  // 北墙上的窗户有独立亮玻璃和窗框；spot light 将亮度实际投到室内。
  windowModel('window-west', 2.04),
  windowModel('window-center', 5.04),
  windowModel('window-east', 6.04),
  sideWindowModel(),
  { kind: 'light', name: 'window-west-light', lightType: 'spot', x: 2.5, y: 2.0, z: 3.14, color: 0xc8efff, intensity: 16, distance: 6, angle: 0.72, penumbra: 0.76, target: { x: 2.8, y: 0, z: 6.4 } },
  { kind: 'light', name: 'window-east-light', lightType: 'spot', x: 6.0, y: 2.0, z: 3.14, color: 0xffe4ad, intensity: 18, distance: 7, angle: 0.8, penumbra: 0.78, target: { x: 6.8, y: 0, z: 7.2 } },
  { kind: 'light', name: 'window-east-wall-light', lightType: 'spot', x: 10.78, y: 1.85, z: 6.62, color: 0xffc875, intensity: 17, distance: 7.5, angle: 0.72, penumbra: 0.74, target: { x: 7.2, y: 0, z: 7.0 } },

  // 窗框切出的柔边矩形用单面 additive patch 表现；比实时投影纹理更稳定轻量。
  { kind: 'lightPatch', name: 'north-window-ray-a', x: 5.42, z: 5.48, w: 0.42, d: 3.4, color: 0xffe0a0, opacity: 0.13, rotationY: -0.09, feather: 0.24 },
  { kind: 'lightPatch', name: 'north-window-ray-b', x: 6.04, z: 5.38, w: 0.42, d: 3.2, color: 0xffdda0, opacity: 0.11, rotationY: -0.09, feather: 0.24 },
  { kind: 'lightPatch', name: 'north-window-ray-c', x: 6.66, z: 5.28, w: 0.42, d: 3.0, color: 0xffd18a, opacity: 0.09, rotationY: -0.09, feather: 0.24 },
  { kind: 'lightPatch', name: 'east-window-ray-a', x: 8.65, z: 5.86, w: 3.0, d: 0.62, color: 0xffc86b, opacity: 0.16, rotationY: 0.08, feather: 0.22 },
  { kind: 'lightPatch', name: 'east-window-ray-b', x: 8.4, z: 6.88, w: 3.35, d: 0.72, color: 0xffbd5d, opacity: 0.14, rotationY: 0.08, feather: 0.22 },
  { kind: 'lightPatch', name: 'east-window-ray-c', x: 8.12, z: 7.96, w: 3.65, d: 0.78, color: 0xffb553, opacity: 0.11, rotationY: 0.08, feather: 0.22 },
  { kind: 'dust', name: 'sunlit-dust', count: 72, x: 0.5, z: 3.2, w: 10, d: 5.4, minY: 0.16, maxY: 2.25, color: 0xffd34f, size: 5.5, opacity: 0.82 },

  group('refrigerator', [
    { name: 'refrigerator-body', x: 0.08, z: 3.04, w: 0.88, d: 0.76, h: 1.7, top: `${P}/fridge-top.png`, front: `${P}/fridge-front.png`, color: 0xcbd8d5 },
    { name: 'refrigerator-divider', x: 0.13, z: 3.802, w: 0.78, d: 0.025, h: 0.045, y: 0.67, color: 0x50606b },
    { name: 'refrigerator-handle-top', x: 0.18, z: 3.83, w: 0.08, d: 0.05, h: 0.34, y: 1.02, color: 0xf1f1df },
    { name: 'refrigerator-handle-bottom', x: 0.18, z: 3.83, w: 0.08, d: 0.05, h: 0.3, y: 0.38, color: 0xf1f1df },
  ]),
  group('sink-counter', [
    { name: 'sink-cabinet', x: 1.08, z: 3.08, w: 1.46, d: 0.7, h: 0.65, front: `${P}/counter-front.png`, color: 0x7a543b },
    { name: 'sink-countertop', x: 1.02, z: 3.02, w: 1.58, d: 0.8, h: 0.12, y: 0.65, top: `${P}/counter-top.png`, color: 0xe7d9ac },
    { name: 'sink-basin', x: 1.37, z: 3.18, w: 0.82, d: 0.42, h: 0.035, y: 0.775, color: 0x7eabb2 },
    { kind: 'cylinder', name: 'sink-faucet', x: 2.0, z: 3.2, radius: 0.05, h: 0.38, y: 0.78, color: 0xc5d9d8, segments: 8 },
  ]),
  group('kitchen-stove', [
    { name: 'stove-body', x: 2.72, z: 3.05, w: 1.16, d: 0.76, h: 0.78, front: `${P}/cabinet-front.png`, color: 0x657078 },
    { name: 'stove-top', x: 2.68, z: 3.01, w: 1.24, d: 0.82, h: 0.1, y: 0.78, top: `${P}/cabinet-top.png`, color: 0xc6c9bc },
    { name: 'oven-door', x: 2.86, z: 3.815, w: 0.78, d: 0.035, h: 0.42, y: 0.17, color: 0x26313b },
    { name: 'oven-handle', x: 2.92, z: 3.86, w: 0.66, d: 0.06, h: 0.06, y: 0.62, color: 0xd7ddd2 },
    { kind: 'cylinder', name: 'hob-left', x: 2.98, z: 3.36, radius: 0.17, h: 0.025, y: 0.89, color: 0x313944, segments: 12 },
    { kind: 'cylinder', name: 'hob-right', x: 3.58, z: 3.36, radius: 0.17, h: 0.025, y: 0.89, color: 0x313944, segments: 12 },
  ]),

  group('tv-cabinet', [
    { name: 'tv-cabinet-body', x: 1.9, z: 4.42, w: 2.25, d: 0.7, h: 0.42, front: `${P}/tvtable-front.png`, color: 0x8d5b38 },
    { name: 'tv-cabinet-top', x: 1.84, z: 4.36, w: 2.37, d: 0.8, h: 0.1, y: 0.42, top: `${P}/tvtable-top.png`, color: 0xb77b45 },
    { name: 'tv-cabinet-door-left', x: 2.02, z: 5.085, w: 0.85, d: 0.04, h: 0.25, y: 0.08, color: 0x69402f },
    { name: 'tv-cabinet-door-right', x: 3.0, z: 5.085, w: 0.85, d: 0.04, h: 0.25, y: 0.08, color: 0x69402f },
  ]),
  group('television', [
    { name: 'television-body', x: 2.28, z: 4.54, w: 1.3, d: 0.34, h: 0.82, y: 0.52, color: 0x202b36 },
    {
      name: 'television-screen', x: 2.39, z: 4.885, w: 0.98, d: 0.035, h: 0.55,
      y: 0.68, color: 0xcaf7ff, unlit: true, glow: { speed: 2.2, strength: 0.34 },
    },
    { name: 'television-screen-glint', x: 2.47, z: 4.923, w: 0.12, d: 0.02, h: 0.42, y: 0.75, color: 0xffffff, unlit: true, rotationZ: -0.26 },
    { name: 'television-control-panel', x: 3.41, z: 4.89, w: 0.1, d: 0.04, h: 0.54, y: 0.69, color: 0x111821 },
    { name: 'television-foot-left', x: 2.42, z: 4.61, w: 0.16, d: 0.2, h: 0.08, y: 0.44, color: 0x151c24 },
    { name: 'television-foot-right', x: 3.27, z: 4.61, w: 0.16, d: 0.2, h: 0.08, y: 0.44, color: 0x151c24 },
  ]),
  {
    kind: 'light', name: 'television-screen-light', lightType: 'point',
    x: 2.88, y: 0.98, z: 5.1, color: 0x9deeff, intensity: 8, distance: 3.8, decay: 2,
    pulse: { minIntensity: 4.2, maxIntensity: 10.2, speed: 1.7 },
  },
  group('game-console', [
    { name: 'game-console-body', x: 3.7, z: 4.62, w: 0.56, d: 0.46, h: 0.46, y: 0.52, front: `${P}/console1f-front.png`, color: 0x8d949e },
    { name: 'game-console-slot', x: 3.79, z: 5.085, w: 0.38, d: 0.035, h: 0.05, y: 0.83, color: 0x222b35 },
    { name: 'game-console-light', x: 4.08, z: 5.123, w: 0.05, d: 0.02, h: 0.05, y: 0.65, color: 0x80ff94, unlit: true },
  ]),

  diningTable(),
  diningChair('dining-chair-west-north', 2.12, 6.14, false),
  diningChair('dining-chair-west-south', 2.12, 7.1, false),
  diningChair('dining-chair-east-north', 5.08, 6.14, true),
  diningChair('dining-chair-east-south', 5.08, 7.1, true),
];

// 2F 家具（按用户要求精简）：只保留矮桌、转椅、床；
// 时钟/海报/楼梯口烘焙在墙面贴图里。尺寸按 16px = 1 单位对齐贴图纵横比。
const FURNITURE_2F: InteriorFurniture[] = [
  // 深色矮桌（贴北墙，横跨 tile 0..2）
  {
    name: 'study-desk-table', x: 0.03, z: 2.04, w: 1.94, d: 0.9, h: 0.5,
    front: `${P}/desk-front.png`, color: 0x454a66,
  },
  // 橙色转椅（塞在矮桌前）：椅背在西侧，与原精灵一致
  group('desk-chair', [
    {
      name: 'desk-chair-seat', x: 0.22, z: 2.96, w: 0.66, d: 0.6, h: 0.18, y: 0.42,
      top: `${P}/chair-top.png`, color: 0xd98a2b,
    },
    { name: 'desk-chair-back', x: 0.08, z: 2.96, w: 0.14, d: 0.6, h: 0.98, color: 0xd98a2b },
    { name: 'desk-chair-leg-north-west', x: 0.26, z: 3.0, w: 0.1, d: 0.1, h: 0.42, color: CHAIR_FRAME },
    { name: 'desk-chair-leg-north-east', x: 0.74, z: 3.0, w: 0.1, d: 0.1, h: 0.42, color: CHAIR_FRAME },
    { name: 'desk-chair-leg-south-west', x: 0.26, z: 3.44, w: 0.1, d: 0.1, h: 0.42, color: CHAIR_FRAME },
    { name: 'desk-chair-leg-south-east', x: 0.74, z: 3.44, w: 0.1, d: 0.1, h: 0.42, color: CHAIR_FRAME },
  ]),
  // 床：床头板 + 床垫（rows 4-5）
  group('bed', [
    { name: 'bed-headboard', x: 0.62, z: 3.84, w: 1.72, d: 0.18, h: 0.85, color: 0x8a8fa8 },
    {
      name: 'bed-mattress', x: 0.62, z: 4.0, w: 1.72, d: 1.86, h: 0.48,
      top: `${P}/bed-top.png`, front: `${P}/bed-front.png`, color: 0xd8dae6,
    },
  ]),
];

const EXIT_TO_TOWN: Omit<MapWarp, 'x' | 'y'> = {
  dest: 'littleroot',
  destX: 5,
  destY: 49,
  destFacing: 'down',
};

export const PLAYER_HOUSE_1F: MapData = {
  id: 'player-house-1f',
  width: 11,
  height: 9,
  groundTexture: `${BASE}/floor-1f.png`,
  collision: COLLISION_1F,
  props: [],
  npcs: [{
    id: 'mom', name: '妈妈', texture: 'assets/sprites/npcs/mom.png',
    dialogue: ['先去楼上看看自己的房间吧。墙上的时钟还等着你来设置呢。'],
    interactionId: 'mom',
    x: 7, y: 5, facing: 'down',
    wander: {
      // 在厨房与客厅间走动，但不进入门垫所在的最后一排，以免堵住出入口。
      bounds: [0, 3, 10, 7],
      maxWalkSteps: 2,
      pauseSeconds: [1.5, 3.5],
    },
  }],
  // 电视机横跨 x=2..3；两格正面都应能从南侧调查，避免只有左边缘可触发。
  interactions: [
    { id: 'watch-tv', x: 2, y: 4, phases: ['watch_tv'] },
    { id: 'watch-tv', x: 3, y: 4, phases: ['watch_tv'] },
  ],
  spawn: { x: 8, y: 8, facing: 'up' },
  cameraDistance: 9,
  background: 0x1a1512,
  interior: {
    floor: { x: 0, y: 2, width: 11, height: 7 },
    wall: { ...WALL, northZ: 3, northTexture: `${BASE}/wall-1f.png` },
    furniture: FURNITURE_1F,
  },
  warps: [
    { x: 8, y: 8, ...EXIT_TO_TOWN },
    { x: 9, y: 8, ...EXIT_TO_TOWN },
    {
      x: 8, y: 2,
      dest: 'player-house-2f', destX: 7, destY: 2, destFacing: 'down',
    },
  ],
};

export const PLAYER_HOUSE_2F: MapData = {
  id: 'player-house-2f',
  width: 9,
  height: 8,
  groundTexture: `${BASE}/floor-2f.png`,
  collision: COLLISION_2F,
  props: [],
  npcs: [],
  interactions: [{ id: 'set-clock', x: 5, y: 1, phases: ['set_clock'] }],
  spawn: { x: 7, y: 2, facing: 'down' },
  cameraDistance: 9,
  background: 0x1a1512,
  interior: {
    floor: { x: 0, y: 1, width: 9, height: 7 },
    wall: { ...WALL, northZ: 2, northTexture: `${BASE}/wall-2f.png` },
    furniture: FURNITURE_2F,
  },
  warps: [
    {
      x: 7, y: 1,
      dest: 'player-house-1f', destX: 8, destY: 3, destFacing: 'down',
    },
  ],
};
