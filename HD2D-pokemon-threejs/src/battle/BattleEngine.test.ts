import { describe, expect, it } from 'vitest';
import { BattleEngine } from './BattleEngine';
import { createPokemon } from './BattleData';

describe('BattleEngine', () => {
  it('consumes PP, applies damage and eventually reaches victory', () => {
    const player = createPokemon('treecko', 5);
    const enemy = createPokemon('zigzagoon', 2);
    const engine = new BattleEngine(player, enemy, () => 0.5);
    const initialPp = player.moves[0].pp;

    let turns = 0;
    while (!engine.finished && turns++ < 20) engine.runTurn(0);

    expect(player.moves[0].pp).toBeLessThan(initialPp);
    expect(enemy.hp).toBe(0);
    expect(player.hp).toBeGreaterThan(0);
  });

  it('never deals less than one damage with a damaging move', () => {
    const player = createPokemon('mudkip', 5);
    const enemy = createPokemon('zigzagoon', 2);
    const engine = new BattleEngine(player, enemy, () => 0);
    const before = enemy.hp;

    engine.runTurn(0);

    expect(enemy.hp).toBeLessThan(before);
  });

  it('emits semantic events that can drive the presentation timeline', () => {
    const player = createPokemon('treecko', 5);
    const enemy = createPokemon('zigzagoon', 2);
    const engine = new BattleEngine(player, enemy, () => 0.5);

    const messages = engine.runTurn(0);

    expect(messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'move', actor: 'player', target: 'enemy' }),
      expect.objectContaining({ kind: 'damage', actor: 'player', target: 'enemy' }),
    ]));
  });

  it('lets repeated escape attempts improve while failed attempts leave combat active', () => {
    const slowPlayer = createPokemon('wurmple', 5);
    const fastEnemy = createPokemon('treecko', 5);
    const engine = new BattleEngine(slowPlayer, fastEnemy, () => 0.99);

    expect(engine.tryEscape(1).escaped).toBe(false);
    expect(engine.tryEscape(20).escaped).toBe(true);
    expect(engine.finished).toBe(false);
  });

  it('supports an enemy-only turn after using an item or switching', () => {
    const player = createPokemon('treecko', 5);
    const enemy = createPokemon('zigzagoon', 2);
    const engine = new BattleEngine(player, enemy, () => 0.5);
    const before = player.hp;

    const messages = engine.runEnemyTurn();

    expect(player.hp).toBeLessThan(before);
    expect(messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'move', actor: 'enemy', target: 'player' }),
    ]));
  });
});
