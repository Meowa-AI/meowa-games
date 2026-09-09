import { describe, expect, it } from 'vitest';
import { POKEMON_CATALOG } from './PokemonCatalog';
import {
  calculateSpriteFootClearance, getSpeciesPresentation, SPECIES_PRESENTATION,
} from './BattlePresentation';

describe('species battle presentation', () => {
  it('covers every catalog species with a foot anchor, scale and shadow', () => {
    expect(Object.keys(SPECIES_PRESENTATION)).toHaveLength(POKEMON_CATALOG.length);
    for (const species of POKEMON_CATALOG) {
      const presentation = getSpeciesPresentation(species.id);
      expect(presentation.footAnchor).toEqual([0.5, 1]);
      expect(presentation.worldHeight).toBeGreaterThan(0);
      expect(presentation.shadowScale).toBeGreaterThan(0);
    }
  });

  it('keeps the opening species grounded with their individual proportions', () => {
    for (const species of POKEMON_CATALOG) {
      expect(getSpeciesPresentation(species.id).footLift).toBe(0);
    }
    expect(getSpeciesPresentation('treecko').worldHeight)
      .toBeGreaterThan(getSpeciesPresentation('zigzagoon').worldHeight);
  });

  it('derives a visible foot clearance from each cropped sprite height', () => {
    expect(calculateSpriteFootClearance(3.2, 40)).toBeCloseTo(0.16);
    expect(calculateSpriteFootClearance(3.2, 64)).toBeCloseTo(0.1);
    expect(calculateSpriteFootClearance(2.5, 128)).toBeCloseTo(0.08);
  });
});
