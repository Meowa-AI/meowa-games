/** 开局保留的御三家与 101 号道路常见物种；图集只包含这六种。 */
export const POKEMON_ATLAS = {
  frontTexture: 'assets/sprites/pokemon/pokeemerald-front-atlas.png',
  columns: 3, rows: 2, cellSize: 64,
} as const;

export const POKEMON_CATALOG = [
  { id: 'treecko', name: '木守宫', legacyName: 'TREECKO', type: 'grass', base: { hp: 40, attack: 45, defense: 35, speed: 70 }, spriteIndex: 0 },
  { id: 'torchic', name: '火稚鸡', legacyName: 'TORCHIC', type: 'fire', base: { hp: 45, attack: 60, defense: 40, speed: 45 }, spriteIndex: 1 },
  { id: 'mudkip', name: '水跃鱼', legacyName: 'MUDKIP', type: 'water', base: { hp: 50, attack: 70, defense: 50, speed: 40 }, spriteIndex: 2 },
  { id: 'zigzagoon', name: '蛇纹熊', legacyName: 'ZIGZAGOON', type: 'normal', base: { hp: 38, attack: 30, defense: 41, speed: 60 }, spriteIndex: 3 },
  { id: 'poochyena', name: '土狼犬', legacyName: 'POOCHYENA', type: 'dark', base: { hp: 35, attack: 55, defense: 35, speed: 35 }, spriteIndex: 4 },
  { id: 'wurmple', name: '刺尾虫', legacyName: 'WURMPLE', type: 'bug', base: { hp: 45, attack: 45, defense: 35, speed: 20 }, spriteIndex: 5 },
] as const;

export type SpeciesId = typeof POKEMON_CATALOG[number]['id'];
export const ALL_SPECIES_IDS: SpeciesId[] = POKEMON_CATALOG.map((entry) => entry.id);
