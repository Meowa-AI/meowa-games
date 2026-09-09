import type { PokemonInstance } from '../story/GameSession';
import { POKEMON_CATALOG, type SpeciesId } from './PokemonCatalog';

export type ElementType =
  | 'bug' | 'dark' | 'dragon' | 'electric' | 'fighting' | 'fire' | 'flying'
  | 'ghost' | 'grass' | 'ground' | 'ice' | 'normal' | 'poison' | 'psychic'
  | 'rock' | 'steel' | 'water';

export interface MoveData {
  id: string;
  name: string;
  type: ElementType;
  power: number;
  accuracy: number;
  maxPp: number;
}

export interface SpeciesData {
  id: SpeciesId;
  name: string;
  type: ElementType;
  base: { hp: number; attack: number; defense: number; speed: number };
  moves: string[];
  spriteIndex: number;
  accent: string;
}

export const MOVES: Record<string, MoveData> = {
  pound: { id: 'pound', name: '拍击', type: 'normal', power: 40, accuracy: 100, maxPp: 35 },
  scratch: { id: 'scratch', name: '抓', type: 'normal', power: 40, accuracy: 100, maxPp: 35 },
  tackle: { id: 'tackle', name: '撞击', type: 'normal', power: 40, accuracy: 100, maxPp: 35 },
  leer: { id: 'leer', name: '瞪眼', type: 'normal', power: 0, accuracy: 100, maxPp: 30 },
  growl: { id: 'growl', name: '叫声', type: 'normal', power: 0, accuracy: 100, maxPp: 40 },
};

const TYPE_ACCENT: Record<ElementType, string> = {
  bug: '#9aaa37', dark: '#66564b', dragon: '#7662d8', electric: '#e5bf37',
  fighting: '#ad4a3d', fire: '#df7443', flying: '#7f9dcc', ghost: '#675c91',
  grass: '#64a94e', ground: '#bd9954', ice: '#74b9bd', normal: '#9a9688',
  poison: '#9b579c', psychic: '#d35e82', rock: '#a38d4e', steel: '#9297a5', water: '#568ac8',
};

const MOVE_OVERRIDES: Partial<Record<SpeciesId, string[]>> = {
  treecko: ['pound', 'leer'], torchic: ['scratch', 'growl'],
  mudkip: ['tackle', 'growl'], zigzagoon: ['tackle', 'growl'],
};

export const SPECIES = Object.fromEntries(POKEMON_CATALOG.map((entry) => [entry.id, {
  ...entry,
  type: entry.type as ElementType,
  moves: MOVE_OVERRIDES[entry.id] ?? ['tackle', 'growl'],
  accent: TYPE_ACCENT[entry.type as ElementType],
}])) as unknown as Record<SpeciesId, SpeciesData>;

function stat(base: number, level: number): number {
  return Math.floor(((2 * base + 15) * level) / 100) + 5;
}

export function createPokemon(species: SpeciesId, level: number): PokemonInstance {
  const data = SPECIES[species];
  const maxHp = Math.floor(((2 * data.base.hp + 15) * level) / 100) + level + 10;
  return {
    species,
    nickname: data.name,
    level,
    experience: 0,
    hp: maxHp,
    maxHp,
    moves: data.moves.map((id) => ({ id, pp: MOVES[id].maxPp })),
  };
}

export function battleStats(mon: PokemonInstance): { attack: number; defense: number; speed: number } {
  const base = SPECIES[mon.species].base;
  return {
    attack: stat(base.attack, mon.level),
    defense: stat(base.defense, mon.level),
    speed: stat(base.speed, mon.level),
  };
}
