import type { MapData } from '../MapData';
import { BIRCH_LAB } from './lab';

/**
 * 剧情版研究所：完整继承 lab.ts 的逐物件模型、碰撞与双向传送，
 * 这里只追加开场流程所需的博士 NPC，避免维护第二份退化的家具清单。
 */
export const OPENING_BIRCH_LAB: MapData = {
  ...BIRCH_LAB,
  npcs: [...BIRCH_LAB.npcs, {
    id: 'birch-lab',
    name: '小田卷博士',
    texture: 'assets/sprites/story/prof-birch.png',
    dialogue: ['和宝可梦一起在野外行动，才能真正了解它们。'],
    interactionId: 'birch-lab',
    visibleDuring: ['starter_received', 'free_roam'],
    x: 6,
    y: 5,
    facing: 'down',
  }],
};
