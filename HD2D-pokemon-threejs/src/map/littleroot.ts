import type { SpeciesId } from '../battle/PokemonCatalog';
import type { MapData, MapProp, WildEncounterTable } from './MapData';
import oldaleLayout from './oldale-layout.json';
import route101Layout from './route101-layout.json';

/**
 * 古辰镇 + Route 101 + 未白镇的连续地图数据。
 * 坐标系：tile (x, y)，x 向右，y 向下；古辰镇位于 y=0..19，
 * Route 101 位于 y=20..39，未白镇位于 y=40..59。
 */

const W = 20;
const TOWN_H = 20;
const ROUTE_Y = oldaleLayout.routeOffsetY;
const TOWN_Y = route101Layout.townOffsetY;
const H = TOWN_Y + TOWN_H;

type Point = [number, number];
type Rect = [number, number, number, number];

const shiftPoint = ([x, y]: Point, dy: number): Point => [x, y + dy];
const shiftRect = ([x1, y1, x2, y2]: Rect, dy: number): Rect =>
  [x1, y1 + dy, x2, y2 + dy];

/** 树锚点（树冠左上角 tile），每棵占地 2x2 */
const TOWN_TREE_ANCHORS: Point[] = [
  [0, 0], [2, 0], [4, 0], [6, 0], [8, 0],
  [12, 0], [14, 0], [16, 0], [18, 0],
  [0, 2], [18, 2],
  [18, 16], [0, 18], [16, 18], [18, 18],
];

/** Route 101 的树墙、树岛与出口均逐格取自 20x20 参考网格。 */
const ROUTE_TREE_ANCHORS = (route101Layout.treeAnchors as Point[])
  .map((point) => shiftPoint(point, ROUTE_Y));
const OLDALE_TREE_ANCHORS = oldaleLayout.treeAnchors as Point[];
const TREE_ANCHORS: Point[] = [
  ...OLDALE_TREE_ANCHORS,
  ...ROUTE_TREE_ANCHORS,
  ...TOWN_TREE_ANCHORS.map((point) => shiftPoint(point, TOWN_Y)),
];

/** 建筑占地矩形 [x1, y1, x2, y2)（含头不含尾） */
const PLAYER_HOUSE = shiftRect([2, 4, 7, 9], TOWN_Y);
/** 玩家家门所在 tile（正面墙贴图上门洞的水平位置，占地最下行） */
const PLAYER_HOUSE_DOOR: Point = [5, TOWN_Y + 8];
const RIVAL_HOUSE = shiftRect([13, 4, 18, 9], TOWN_Y);
/** 对手家门所在 tile（与玩家家同款正面墙贴图，门洞居中） */
const RIVAL_HOUSE_DOOR: Point = [16, TOWN_Y + 8];
const LAB = shiftRect([3, 12, 10, 17], TOWN_Y);
/** 原版研究所门点 (7,16)，位于建筑占地最下行。 */
const LAB_DOOR: Point = [7, TOWN_Y + 16];
const OLDALE_HOUSE_NORTH = oldaleLayout.buildings.houseNorth as Rect;
const OLDALE_MART = oldaleLayout.buildings.mart as Rect;
const OLDALE_CENTER = oldaleLayout.buildings.center as Rect;
const OLDALE_HOUSE_SOUTH = oldaleLayout.buildings.houseSouth as Rect;

/** 牌子（门牌/告示牌），各占 1 tile */
const SIGNS: Point[] = [
  ...(oldaleLayout.signs as Point[]),
  ...(route101Layout.signs as Point[]).map((point) => shiftPoint(point, ROUTE_Y)),
  ...([[7, 8], [12, 8], [6, 17], [15, 13]] as Point[])
    .map((point) => shiftPoint(point, TOWN_Y)),
];

/** 花丛（立体交叉面片，可穿行） */
const TOWN_FLOWERS: Point[] = [
  [19, 7], [0, 8], [18, 8], [1, 9], [19, 9], [0, 10], [3, 10],
  [16, 10], [18, 10], [3, 17], [4, 17], [5, 17], [3, 18], [4, 18], [5, 18],
];
const FLOWERS: Point[] = [
  ...(oldaleLayout.flowers as Point[]),
  ...(route101Layout.flowers as Point[]).map((point) => shiftPoint(point, ROUTE_Y)),
  ...TOWN_FLOWERS.map((point) => shiftPoint(point, TOWN_Y)),
];

/** 高草格：可穿行，只参与视觉遮挡与风摆，不写入碰撞网格。 */
const TALL_GRASS = (route101Layout.tallGrassCells as Point[])
  .map((point) => shiftPoint(point, ROUTE_Y));

const ROUTE101_COMMON_SPECIES: SpeciesId[] = ['zigzagoon', 'poochyena', 'wurmple'];
/** 101 号道路只保留开局常见的三种宝可梦。 */
export const ROUTE101_WILD_ENCOUNTERS: WildEncounterTable = {
  cells: TALL_GRASS,
  encounterRate: 0.18,
  cooldownSteps: 4,
  entries: [
    ...ROUTE101_COMMON_SPECIES.map((species) => ({
      species, minLevel: 2, maxLevel: 3, weight: 1,
    })),
  ],
};

/** 浅色草地由运行时直接使用 Meowa 4x4 dual-grid atlas 绘制。 */
const LIGHT_GRASS_CELLS: Point[] = [
  ...(oldaleLayout.clearingSpans as unknown as Array<[number, Array<[number, number]>]>)
    .flatMap(([y, spans]) =>
      spans.flatMap(([x1, x2]) =>
        Array.from({ length: x2 - x1 }, (_, offset): Point => [x1 + offset, y]),
      ),
    ),
  ...(route101Layout.clearingCells as Point[])
    .map((point) => shiftPoint(point, ROUTE_Y)),
];

function buildCollision(): number[][] {
  const grid: number[][] = Array.from({ length: H }, () => Array(W).fill(0));
  const blockRect = (x1: number, y1: number, x2: number, y2: number) => {
    for (let y = y1; y < y2; y++)
      for (let x = x1; x < x2; x++) grid[y][x] = 1;
  };
  for (const [x, y] of TREE_ANCHORS) blockRect(x, y, x + 2, y + 2);
  for (const [x1, y, x2] of route101Layout.ledges)
    blockRect(x1, y + ROUTE_Y, x2, y + ROUTE_Y + 1);
  blockRect(...OLDALE_HOUSE_NORTH);
  blockRect(...OLDALE_MART);
  blockRect(...OLDALE_CENTER);
  blockRect(...OLDALE_HOUSE_SOUTH);
  blockRect(...PLAYER_HOUSE);
  blockRect(...RIVAL_HOUSE);
  blockRect(...LAB);
  for (const [x, y] of SIGNS) grid[y][x] = 1;
  // 家门格放行：踏上即触发进屋 warp（门画在正面墙贴图上）。
  grid[PLAYER_HOUSE_DOOR[1]][PLAYER_HOUSE_DOOR[0]] = 0;
  grid[RIVAL_HOUSE_DOOR[1]][RIVAL_HOUSE_DOOR[0]] = 0;
  grid[LAB_DOOR[1]][LAB_DOOR[0]] = 0;
  return grid;
}

/**
 * 地图外装饰森林（不参与碰撞，界外本就不可达）。
 * 草地裙边很宽，因此不能只沿地图边缘放一圈树：这里铺满 30 tile 的外围树带，
 * 靠镇一圈保持完整，远处按固定规则留少量空隙，避免看起来像整齐苗圃。
 * 北侧继续为古辰镇保留与参考图一致的四格出口。
 */
function borderTreeAnchors(): Array<[number, number]> {
  const anchors: Array<[number, number]> = [];
  const FOREST_MARGIN = 30;
  for (let y = -FOREST_MARGIN; y <= H + FOREST_MARGIN - 2; y += 2) {
    for (let x = -FOREST_MARGIN; x <= W + FOREST_MARGIN - 2; x += 2) {
      // 只铺在 20x40 活动区域之外。
      if (x >= 0 && x < W && y >= 0 && y < H) continue;
      // 北侧道路向森林深处延续，避免出口被树墙封死。
      if (
        y < 0
        && x >= oldaleLayout.northExit[0]
        && x < oldaleLayout.northExit[1]
      ) continue;

      const nearTown = x === -2 || x === W || y === -2 || y === H;
      const decorativeGap = Math.abs(x * 17 + y * 31 + x * y) % 7 === 0;
      if (nearTown || !decorativeGap) anchors.push([x, y]);
    }
  }
  return anchors;
}

function buildProps(): MapProp[] {
  const props: MapProp[] = [];
  // prop 的 y 取占地最下面一行；面片底边落在该行南缘
  for (const [x, y] of [...TREE_ANCHORS, ...borderTreeAnchors()])
    props.push({ kind: 'tree', x, y: y + 1, width: 2 });
  props.push({
    kind: 'oldaleHouse', x: OLDALE_HOUSE_NORTH[0],
    y: OLDALE_HOUSE_NORTH[3] - 1, width: OLDALE_HOUSE_NORTH[2] - OLDALE_HOUSE_NORTH[0],
  });
  props.push({
    kind: 'oldaleMart', x: OLDALE_MART[0],
    y: OLDALE_MART[3] - 1, width: OLDALE_MART[2] - OLDALE_MART[0],
  });
  props.push({
    kind: 'oldaleCenter', x: OLDALE_CENTER[0],
    y: OLDALE_CENTER[3] - 1, width: OLDALE_CENTER[2] - OLDALE_CENTER[0],
  });
  props.push({
    kind: 'oldaleHouse', x: OLDALE_HOUSE_SOUTH[0],
    y: OLDALE_HOUSE_SOUTH[3] - 1, width: OLDALE_HOUSE_SOUTH[2] - OLDALE_HOUSE_SOUTH[0],
  });
  props.push({ kind: 'house', x: PLAYER_HOUSE[0], y: PLAYER_HOUSE[3] - 1, width: 5 });
  props.push({ kind: 'house', x: RIVAL_HOUSE[0], y: RIVAL_HOUSE[3] - 1, width: 5 });
  props.push({ kind: 'lab', x: LAB[0], y: LAB[3] - 1, width: 7 });
  for (const [x, y] of SIGNS) props.push({ kind: 'sign', x, y, width: 1 });
  for (const [x, y] of FLOWERS) props.push({ kind: 'flower', x, y, width: 1 });
  for (const [x, y] of TALL_GRASS) props.push({ kind: 'tallGrass', x, y, width: 1 });
  return props;
}

export const LITTLEROOT: MapData = {
  id: 'littleroot',
  width: W,
  height: H,
  groundTexture: 'assets/maps/littleroot-route101-ground-base.png',
  dualGridTerrain: {
    texture: 'assets/tilesets/route101-clearing-dual-grid.png',
    filledCells: LIGHT_GRASS_CELLS,
  },
  groundOverlays: [{
    texture: 'assets/maps/route101-ledges.png',
    height: 0.12,
  }],
  collision: buildCollision(),
  props: buildProps(),
  wildEncounters: ROUTE101_WILD_ENCOUNTERS,
  battle: { kind: 'forest', centers: [[7.5, 31.25]] },
  npcs: [
    {
      id: 'route101-camper',
      name: '露营少年',
      texture: 'assets/sprites/npcs/camper.png',
      dialogue: [
        '我正在观察草丛里的宝可梦。',
        '在高高的草丛里走动时，\n随时都可能遇见野生宝可梦！',
      ],
      x: 8,
      y: ROUTE_Y + 10,
      facing: 'right',
      wander: {
        bounds: [6, ROUTE_Y + 8, 9, ROUTE_Y + 11],
        maxWalkSteps: 2,
        pauseSeconds: [1.2, 3.2],
      },
    },
    {
      id: 'route101-youngster',
      name: '短裤少年',
      texture: 'assets/sprites/npcs/youngster.png',
      dialogue: [
        '101号道路的风吹起来真舒服！',
        '我要在这里多走几圈，\n把腿脚锻炼得更有力气。',
      ],
      x: 16,
      y: ROUTE_Y + 8,
      facing: 'down',
      wander: {
        bounds: [15, ROUTE_Y + 7, 17, ROUTE_Y + 11],
        maxWalkSteps: 3,
        pauseSeconds: [1.4, 3.6],
      },
    },
    {
      id: 'oldale-girl',
      name: '古辰镇的女孩',
      texture: 'assets/sprites/npcs/girl-3.png',
      dialogue: [
        '欢迎来到古辰镇！',
        '这里有宝可梦中心和友好商店，\n出发前可以先做好准备。',
      ],
      x: 16,
      y: 11,
      facing: 'left',
      wander: {
        bounds: [13, 9, 17, 12],
        maxWalkSteps: 2,
        pauseSeconds: [1.5, 3.8],
      },
    },
    {
      id: 'fat-man',
      name: '镇上的居民',
      texture: 'assets/sprites/npcs/fat-man.png',
      dialogue: [
        '你是刚搬来未白镇的吗？',
        '这里虽然不大，却被草木和风声包围着。\n住久了会很安心的。',
      ],
      x: 8,
      y: TOWN_Y + 10,
      facing: 'down',
      wander: {
        bounds: [7, TOWN_Y + 9, 13, TOWN_Y + 12],
        maxWalkSteps: 2,
        pauseSeconds: [1.5, 3.5],
      },
    },
    {
      id: 'boy-2',
      name: '少年',
      texture: 'assets/sprites/npcs/boy-2.png',
      dialogue: [
        '我在练习和宝可梦一起散步！',
        '等我准备好了，就要沿着北边的道路去冒险。',
      ],
      x: 10,
      y: TOWN_Y + 14,
      facing: 'left',
      wander: {
        bounds: [10, TOWN_Y + 12, 12, TOWN_Y + 17],
        maxWalkSteps: 2,
        pauseSeconds: [1.5, 3.5],
      },
    },
    {
      id: 'twin',
      name: '女孩',
      texture: 'assets/sprites/npcs/twin.png',
      idleAnimation: {
        texture: 'assets/sprites/npcs/twin-idle-spritesheet.png',
        columns: 2,
        rows: 2,
        frames: 4,
        fps: 4,
        facing: 'down',
      },
      dialogue: [
        '听说小田卷博士常常在野外观察宝可梦。',
        '如果你也喜欢宝可梦，\n记得去研究所看看呀！',
      ],
      x: 10,
      y: TOWN_Y + 1,
      facing: 'down',
      interactionId: 'route-gate-child',
    },
    {
      id: 'birch-field', name: '小田卷博士',
      texture: 'assets/sprites/story/prof-birch.png',
      dialogue: ['拜托了！背包里有精灵球！'],
      // 保持到战斗舞台完成遮罩接管，避免选择御三家后在转场前闪退。
      visibleDuring: ['rescue_birch', 'choose_starter', 'first_battle'],
      blocksMovement: false,
      // 博士与蛇纹熊共用追逐轨迹；更大的相位让博士始终跑在前面。
      orbit: { radiusX: 1.45, radiusY: 0.85, periodSeconds: 2.4, startAngle: Math.PI + 1.05 },
      x: 8, y: ROUTE_Y + 15, facing: 'right',
    },
    {
      id: 'zigzagoon-field', name: '蛇纹熊',
      texture: 'assets/sprites/story/enemy-zigzagoon.png',
      spriteLayout: 'walk9Wide', spriteWorldSize: [2, 2],
      blocksMovement: false,
      orbit: { radiusX: 1.45, radiusY: 0.85, periodSeconds: 2.4, startAngle: Math.PI },
      dialogue: [], visibleDuring: ['rescue_birch', 'choose_starter', 'first_battle'],
      x: 8, y: ROUTE_Y + 15, facing: 'left',
    },
    {
      id: 'starter-bag', name: '博士的背包',
      texture: 'assets/sprites/story/birchs-bag.png',
      spriteLayout: 'static', spriteWorldSize: [1, 1],
      dialogue: ['里面放着三颗精灵球。'], interactionId: 'starter-bag',
      visibleDuring: ['rescue_birch', 'choose_starter', 'first_battle'],
      x: 10, y: ROUTE_Y + 16, facing: 'down',
    },
  ],
  stepTriggers: [
    // 北侧入口是两格宽；女孩占住 x=10 后，玩家会自然从 x=11 绕行。
    // 两格必须共享相同的阶段门禁和博士求救触发，不能只检测中央格。
    {
      id: 'route-blocked', x: 10, y: TOWN_Y - 1,
      phases: ['intro_mom', 'set_clock', 'watch_tv', 'visit_rival'],
    },
    {
      id: 'route-blocked', x: 11, y: TOWN_Y - 1,
      phases: ['intro_mom', 'set_clock', 'watch_tv', 'visit_rival'],
    },
    { id: 'start-birch-rescue', x: 10, y: TOWN_Y - 1, phases: ['go_route101'], once: true },
    { id: 'start-birch-rescue', x: 11, y: TOWN_Y - 1, phases: ['go_route101'], once: true },
  ],
  spawn: { x: 10, y: TOWN_Y + 10, facing: 'down' },
  warps: [
    {
      x: PLAYER_HOUSE_DOOR[0], y: PLAYER_HOUSE_DOOR[1],
      dest: 'player-house-1f', destX: 8, destY: 8, destFacing: 'up',
    },
    {
      x: RIVAL_HOUSE_DOOR[0], y: RIVAL_HOUSE_DOOR[1],
      dest: 'rival-house-1f', destX: 2, destY: 8, destFacing: 'up',
    },
    {
      x: LAB_DOOR[0], y: LAB_DOOR[1],
      dest: 'birch-lab', destX: 6, destY: 12, destFacing: 'up',
    },
  ],
};
