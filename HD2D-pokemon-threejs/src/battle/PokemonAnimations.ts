import type { SpeciesId } from './PokemonCatalog';
import bundledManifest from '../../assets/runtime-source/sprites/pokemon-animated/manifest.json';

export type PokemonAnimationAction = 'idle' | 'cry' | 'hurt';
export type PokemonAnimationView = 'front' | 'back';

export interface PokemonAnimationSequence {
  url: string;
  frameWidth: number;
  frameHeight: number;
  frames: number;
  columns: number;
  rows: number;
  fps: number;
}

export type PokemonAnimationViewManifest = Partial<
  Record<PokemonAnimationAction, PokemonAnimationSequence>
>;

export type PokemonAnimationManifest = Partial<
  Record<SpeciesId, Partial<Record<PokemonAnimationView, PokemonAnimationViewManifest>>>
>;

let manifestPromise: Promise<PokemonAnimationManifest> | undefined;

export function loadPokemonAnimationManifest(): Promise<PokemonAnimationManifest> {
  manifestPromise ??= fetch('assets/sprites/pokemon-animated/manifest.json')
    .then((response) => {
      if (!response.ok) {
        throw new Error(`宝可梦动画清单加载失败: HTTP ${response.status}`);
      }
      return response.json() as Promise<PokemonAnimationManifest>;
    })
    .catch((error: unknown) => {
      console.warn('宝可梦动画清单不可用，使用随游戏打包的动画定义。', error);
      return bundledManifest as PokemonAnimationManifest;
    });
  return manifestPromise;
}

export async function getPokemonAnimationView(
  species: SpeciesId,
  view: PokemonAnimationView,
): Promise<PokemonAnimationViewManifest | undefined> {
  const manifest = await loadPokemonAnimationManifest();
  const definition = manifest[species]?.[view];
  return definition?.idle
    ? definition
    : (bundledManifest as PokemonAnimationManifest)[species]?.[view];
}

export function pokemonAnimationFrameOffset(
  sequence: PokemonAnimationSequence,
  frame: number,
): readonly [number, number] {
  const safeFrame = Math.max(0, Math.min(sequence.frames - 1, frame));
  const column = safeFrame % sequence.columns;
  const row = Math.floor(safeFrame / sequence.columns);
  return [column / sequence.columns, 1 - (row + 1) / sequence.rows];
}
