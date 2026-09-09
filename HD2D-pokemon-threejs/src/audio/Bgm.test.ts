import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { POKEMON_CATALOG } from '../battle/PokemonCatalog';
import { cryUrl, moveSfxUrl, SFX } from './Bgm';

describe('runtime audio assets', () => {
  it('contains every selected sound effect', () => {
    for (const path of Object.values(SFX)) {
      expect(existsSync(`public/${path}`), path).toBe(true);
    }
  });

  it('contains a cry for every encounterable catalog species', () => {
    for (const pokemon of POKEMON_CATALOG) {
      const path = cryUrl(pokemon.id);
      expect(existsSync(`public/${path}`), path).toBe(true);
    }
  });

  it('only maps moves with an exact selected sound', () => {
    expect(moveSfxUrl('pound')).toBe(SFX.pound);
    expect(moveSfxUrl('scratch')).toBe(SFX.scratch);
    expect(moveSfxUrl('leer')).toBe(SFX.leer);
    expect(moveSfxUrl('tackle')).toBeUndefined();
    expect(moveSfxUrl('growl')).toBeUndefined();
  });
});
