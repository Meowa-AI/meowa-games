import type { PokemonInstance } from '../story/GameSession';

export type HealingItemId = 'potion' | 'superPotion' | 'maxPotion';
export type CaptureItemId = 'pokeBall' | 'greatBall' | 'ultraBall';
export type BattleItemId = HealingItemId | CaptureItemId;
export type BattleInventory = Record<BattleItemId, number>;

interface BattleItemBase {
  id: BattleItemId;
  name: string;
  description: string;
  kind: 'healing' | 'capture';
}

export interface HealingItemData extends BattleItemBase {
  id: HealingItemId;
  kind: 'healing';
  heal: number | 'full';
}

export interface CaptureItemData extends BattleItemBase {
  id: CaptureItemId;
  kind: 'capture';
  multiplier: number;
  color: number;
}

export type BattleItemData = HealingItemData | CaptureItemData;

export const HEALING_ITEMS: Record<HealingItemId, HealingItemData> = {
  potion: { id: 'potion', kind: 'healing', name: '伤药', description: '回复 20 HP', heal: 20 },
  superPotion: { id: 'superPotion', kind: 'healing', name: '好伤药', description: '回复 50 HP', heal: 50 },
  maxPotion: { id: 'maxPotion', kind: 'healing', name: '全满药', description: '完全回复 HP', heal: 'full' },
};

export const CAPTURE_ITEMS: Record<CaptureItemId, CaptureItemData> = {
  pokeBall: { id: 'pokeBall', kind: 'capture', name: '精灵球', description: '用于捕捉野生宝可梦', multiplier: 1, color: 0xe84b45 },
  greatBall: { id: 'greatBall', kind: 'capture', name: '超级球', description: '比精灵球更容易捕捉', multiplier: 1.5, color: 0x3978c6 },
  ultraBall: { id: 'ultraBall', kind: 'capture', name: '高级球', description: '拥有很高的捕捉性能', multiplier: 2, color: 0x2b2e32 },
};

export const BATTLE_ITEMS: Record<BattleItemId, BattleItemData> = {
  ...HEALING_ITEMS,
  ...CAPTURE_ITEMS,
};

export function createDefaultInventory(): BattleInventory {
  return {
    potion: 3, superPotion: 1, maxPotion: 0,
    pokeBall: 5, greatBall: 0, ultraBall: 0,
  };
}

export function applyBattleItem(item: HealingItemId, target: PokemonInstance): number {
  const before = target.hp;
  const amount = HEALING_ITEMS[item].heal;
  target.hp = amount === 'full'
    ? target.maxHp
    : Math.min(target.maxHp, target.hp + amount);
  return target.hp - before;
}

export function isHealingItem(item: BattleItemId): item is HealingItemId {
  return BATTLE_ITEMS[item].kind === 'healing';
}

export function isCaptureItem(item: BattleItemId): item is CaptureItemId {
  return BATTLE_ITEMS[item].kind === 'capture';
}

export function sanitizeInventory(value: unknown): BattleInventory {
  const source = value && typeof value === 'object' ? value as Partial<BattleInventory> : {};
  const defaults = createDefaultInventory();
  return {
    potion: count(source.potion, defaults.potion),
    superPotion: count(source.superPotion, defaults.superPotion),
    maxPotion: count(source.maxPotion, defaults.maxPotion),
    pokeBall: count(source.pokeBall, defaults.pokeBall),
    greatBall: count(source.greatBall, defaults.greatBall),
    ultraBall: count(source.ultraBall, defaults.ultraBall),
  };
}

function count(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : fallback;
}
