import type { SpeciesId } from './PokemonCatalog';

/** 与运行时清单中的正面待机动画保持一致。 */
export const FRONT_ANIMATED_SPECIES = ["mudkip", "torchic", "treecko", "wurmple", "zigzagoon"] as const satisfies readonly SpeciesId[];
