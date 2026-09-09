import { describe, expect, it } from 'vitest';
import { ROUTE101_WILD_ENCOUNTERS } from '../map/littleroot';
import { ALL_SPECIES_IDS, POKEMON_ATLAS, POKEMON_CATALOG } from './PokemonCatalog';

describe('opening Pokemon catalog', () => {
  it('仅保留御三家与开局常见三种，图集没有空置的旧物种单元', () => {
    expect(ALL_SPECIES_IDS).toEqual(['treecko', 'torchic', 'mudkip', 'zigzagoon', 'poochyena', 'wurmple']);
    expect(new Set(ALL_SPECIES_IDS).size).toBe(6);
    expect(POKEMON_CATALOG.map((entry) => entry.spriteIndex)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(POKEMON_ATLAS.columns * POKEMON_ATLAS.rows).toBe(6);
  });

  it('全部物种均使用简体中文显示名', () => {
    expect(POKEMON_CATALOG.every(({ name }) => name.length > 0 && !/[A-Za-z]/.test(name))).toBe(true);
    expect(POKEMON_CATALOG.map((entry) => entry.name)).toEqual(['木守宫', '火稚鸡', '水跃鱼', '蛇纹熊', '土狼犬', '刺尾虫']);
  });

  it('Route 101 不再包含稀有池或御三家野生遭遇', () => {
    const ids = ROUTE101_WILD_ENCOUNTERS.entries.map((entry) => entry.species);
    expect(ids).toEqual(['zigzagoon', 'poochyena', 'wurmple']);
    expect(ROUTE101_WILD_ENCOUNTERS.entries.every((entry) => entry.weight === 1)).toBe(true);
  });
});
