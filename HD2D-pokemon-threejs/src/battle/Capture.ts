import type { PokemonInstance } from '../story/GameSession';
import { SPECIES } from './BattleData';
import { CAPTURE_ITEMS, type CaptureItemId } from './BattleItems';

export const PARTY_LIMIT = 6;

export interface CaptureAttempt {
  caught: boolean;
  shakes: number;
  chance: number;
}

export function captureChance(target: PokemonInstance, ball: CaptureItemId): number {
  const data = SPECIES[target.species];
  const baseTotal = data.base.hp + data.base.attack + data.base.defense + data.base.speed;
  const catchRate = clamp(Math.round(255 - Math.max(0, baseTotal - 150) * 0.72), 35, 255);
  const healthFactor = (3 * target.maxHp - 2 * target.hp) / (3 * target.maxHp);
  const multiplier = CAPTURE_ITEMS[ball].multiplier;
  return clamp(catchRate / 255 * healthFactor * multiplier, 0.01, 0.95);
}

export function attemptCapture(
  target: PokemonInstance,
  ball: CaptureItemId,
  random: () => number = Math.random,
): CaptureAttempt {
  const chance = captureChance(target, ball);
  const shakeChance = Math.pow(chance, 1 / 4);
  let successfulChecks = 0;
  for (; successfulChecks < 4; successfulChecks++) {
    if (random() >= shakeChance) break;
  }
  return {
    caught: successfulChecks === 4,
    shakes: Math.min(3, successfulChecks),
    chance,
  };
}

export function storeCapturedPokemon(
  pokemon: PokemonInstance,
  party: PokemonInstance[],
  storage: PokemonInstance[],
): 'party' | 'storage' {
  if (party.length < PARTY_LIMIT) {
    party.push(pokemon);
    return 'party';
  }
  storage.push(pokemon);
  return 'storage';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
