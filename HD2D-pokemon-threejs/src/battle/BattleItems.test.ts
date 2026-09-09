import { describe, expect, it } from 'vitest';
import { createPokemon } from './BattleData';
import { applyBattleItem, sanitizeInventory } from './BattleItems';

describe('battle items', () => {
  it('heals without exceeding max HP', () => {
    const pokemon = createPokemon('treecko', 5);
    pokemon.hp = pokemon.maxHp - 3;
    expect(applyBattleItem('potion', pokemon)).toBe(3);
    expect(pokemon.hp).toBe(pokemon.maxHp);
  });

  it('sanitizes legacy or malformed inventory values', () => {
    expect(sanitizeInventory({ potion: -2, superPotion: 2.9 })).toEqual({
      potion: 0, superPotion: 2, maxPotion: 0,
      pokeBall: 5, greatBall: 0, ultraBall: 0,
    });
  });
});
