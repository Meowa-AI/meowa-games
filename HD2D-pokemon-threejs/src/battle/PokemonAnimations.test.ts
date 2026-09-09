import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FRONT_ANIMATED_SPECIES } from './AnimatedPokemonSpecies';
import { ALL_SPECIES_IDS } from './PokemonCatalog';
import { pokemonAnimationFrameOffset } from './PokemonAnimations';

describe('PokemonAnimations', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it.each(['unavailable', 'empty'])('清单 %s 时六种精灵都能复用背面待机图集', async (response) => {
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: response !== 'unavailable', status: 503, json: async () => ({}),
    }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { getPokemonAnimationView } = await import('./PokemonAnimations');
    for (const species of ALL_SPECIES_IDS) {
      const definition = await getPokemonAnimationView(species, 'back');
      expect(definition?.idle?.url).toBe(`assets/sprites/pokemon-animated/${species}/back-idle.png`);
      expect(definition?.idle?.frames).toBeGreaterThan(0);
    }
  });

  it('把从上到下排列的图集帧换算为 Three.js UV 偏移', () => {
    const sequence = {
      url: 'test.png', frameWidth: 48, frameHeight: 48,
      frames: 24, columns: 16, rows: 2, fps: 60,
    };
    expect(pokemonAnimationFrameOffset(sequence, 0)).toEqual([0, 0.5]);
    expect(pokemonAnimationFrameOffset(sequence, 15)).toEqual([15 / 16, 0.5]);
    expect(pokemonAnimationFrameOffset(sequence, 16)).toEqual([0, 0]);
    expect(pokemonAnimationFrameOffset(sequence, 99)).toEqual([7 / 16, 0]);
  });

  it('静态物种清单与运行时 manifest 的正面待机动画完全一致', () => {
    const manifestPath = new URL(
      '../../public/assets/sprites/pokemon-animated/manifest.json', import.meta.url,
    );
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<
      string,
      { front?: { idle?: unknown } }
    >;
    const manifestSpecies = Object.entries(manifest)
      .filter(([, views]) => views.front?.idle)
      .map(([species]) => species)
      .sort();
    expect([...FRONT_ANIMATED_SPECIES].sort()).toEqual(manifestSpecies);
  });
});
