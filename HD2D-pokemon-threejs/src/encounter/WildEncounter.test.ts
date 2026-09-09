import { describe, expect, it } from 'vitest';
import type { WildEncounterTable } from '../map/MapData';
import { WildEncounterController } from './WildEncounter';

const TABLE: WildEncounterTable = {
  cells: [[3, 4], [4, 4]],
  encounterRate: 0.2,
  cooldownSteps: 2,
  entries: [{ species: 'zigzagoon', minLevel: 2, maxLevel: 4, weight: 100 }],
};

function sequence(...values: number[]): () => number {
  let index = 0;
  return () => values[index++] ?? 0;
}

describe('WildEncounterController', () => {
  it('只在遭遇草丛且概率命中时返回宝可梦', () => {
    const controller = new WildEncounterController(sequence(0.8, 0.1, 0, 0.5));
    expect(controller.tryEncounter(TABLE, 1, 1)).toBeUndefined();
    expect(controller.tryEncounter(TABLE, 3, 4)).toBeUndefined();
    expect(controller.tryEncounter(TABLE, 3, 4)).toEqual({ species: 'zigzagoon', level: 3 });
  });

  it('遭遇后按草丛步数冷却，再允许下一次遭遇', () => {
    const controller = new WildEncounterController(() => 0);
    expect(controller.tryEncounter(TABLE, 3, 4)).toBeDefined();
    expect(controller.tryEncounter(TABLE, 4, 4)).toBeUndefined();
    expect(controller.tryEncounter(TABLE, 3, 4)).toBeUndefined();
    expect(controller.tryEncounter(TABLE, 4, 4)).toBeDefined();
  });
});
