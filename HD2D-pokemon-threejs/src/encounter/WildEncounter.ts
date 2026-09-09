import type { WildEncounterTable } from '../map/MapData';
import type { SpeciesId } from '../story/GameSession';

export interface WildEncounter {
  species: SpeciesId;
  level: number;
}

/** 只负责可复现的遭遇判定；剧情阶段与战斗切换由 Game 管理。 */
export class WildEncounterController {
  private cooldown = 0;

  constructor(private readonly random: () => number = () => Math.random()) {}

  tryEncounter(
    table: WildEncounterTable | undefined,
    x: number,
    y: number,
  ): WildEncounter | undefined {
    if (!table || !table.cells.some(([cellX, cellY]) => cellX === x && cellY === y)) {
      return undefined;
    }
    if (this.cooldown > 0) {
      this.cooldown -= 1;
      return undefined;
    }
    if (this.random() >= table.encounterRate) return undefined;

    const totalWeight = table.entries.reduce((sum, entry) => sum + entry.weight, 0);
    if (totalWeight <= 0) return undefined;
    let roll = this.random() * totalWeight;
    const entry = table.entries.find((candidate) => {
      roll -= candidate.weight;
      return roll < 0;
    }) ?? table.entries[table.entries.length - 1];
    if (!entry) return undefined;

    const levelSpan = Math.max(1, entry.maxLevel - entry.minLevel + 1);
    const level = entry.minLevel + Math.floor(this.random() * levelSpan);
    this.cooldown = Math.max(0, table.cooldownSteps);
    return { species: entry.species, level };
  }
}
