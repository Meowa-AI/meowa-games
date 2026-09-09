import { describe, expect, it } from 'vitest';
import { createPokemon } from './BattleData';
import { attemptCapture, captureChance, PARTY_LIMIT, storeCapturedPokemon } from './Capture';

describe('capture rules', () => {
  it('rewards lower HP and stronger balls', () => {
    const target = createPokemon('zigzagoon', 5);
    const fullChance = captureChance(target, 'pokeBall');
    target.hp = 1;
    expect(captureChance(target, 'pokeBall')).toBeGreaterThan(fullChance);
    expect(captureChance(target, 'ultraBall')).toBeGreaterThan(captureChance(target, 'pokeBall'));
  });

  it('reports deterministic success and failure shake counts', () => {
    const target = createPokemon('zigzagoon', 5);
    target.hp = 1;
    expect(attemptCapture(target, 'pokeBall', () => 0)).toMatchObject({ caught: true, shakes: 3 });
    expect(attemptCapture(target, 'pokeBall', () => 0.999)).toMatchObject({ caught: false, shakes: 0 });
  });

  it('fills the party before sending captures to storage', () => {
    const party = Array.from({ length: PARTY_LIMIT - 1 }, () => createPokemon('treecko', 5));
    const storage = [];
    expect(storeCapturedPokemon(createPokemon('zigzagoon', 3), party, storage)).toBe('party');
    expect(storeCapturedPokemon(createPokemon('mudkip', 5), party, storage)).toBe('storage');
    expect(party).toHaveLength(PARTY_LIMIT);
    expect(storage).toHaveLength(1);
  });
});
