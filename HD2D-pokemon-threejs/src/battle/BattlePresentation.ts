import { POKEMON_CATALOG, type SpeciesId } from './PokemonCatalog';

export interface SpeciesPresentation {
  /** 精灵在世界中的可见高度。 */
  worldHeight: number;
  /** alpha 裁切图中的标准脚底锚点。 */
  footAnchor: readonly [x: number, y: number];
  /** 飞行、漂浮或无明确足部物种相对台面的抬升。 */
  footLift: number;
  widthScale: number;
  shadowScale: number;
  shadowOpacity: number;
}

const PRESENTATION_OVERRIDES: Partial<Record<SpeciesId, Partial<SpeciesPresentation>>> = {
  treecko: { worldHeight: 3.55, shadowScale: 0.92 },
  torchic: { worldHeight: 3.2, shadowScale: 0.78 },
  mudkip: { worldHeight: 3.15, widthScale: 1.08, shadowScale: 0.84 },
  zigzagoon: { worldHeight: 3.0, widthScale: 1.08, shadowScale: 0.9 },
};

export const SPECIES_PRESENTATION = Object.fromEntries(
  POKEMON_CATALOG.map((species) => {
    const bulk = (species.base.hp + species.base.attack + species.base.defense) / 3;
    const base: SpeciesPresentation = {
      worldHeight: clamp(3 + (bulk - 40) / 100 * 1.2, 2.55, 4.35),
      footAnchor: [0.5, 1] as const,
      footLift: 0,
      widthScale: 1,
      shadowScale: clamp(0.7 + (bulk - 35) / 170, 0.62, 1.34),
      shadowOpacity: 0.3,
    };
    return [species.id, { ...base, ...PRESENTATION_OVERRIDES[species.id] }];
  }),
) as Record<SpeciesId, SpeciesPresentation>;

export function getSpeciesPresentation(species: SpeciesId): SpeciesPresentation {
  return SPECIES_PRESENTATION[species];
}

/**
 * 将 alpha 裁切精灵底部的两个可见像素换算成世界空间安全间距。
 * 这样最底部的脚部轮廓不会与贴地平台纹理相交。
 */
export function calculateSpriteFootClearance(
  worldHeight: number,
  visiblePixelHeight: number,
): number {
  const worldUnitsPerPixel = worldHeight / Math.max(1, visiblePixelHeight);
  return clamp(worldUnitsPerPixel * 2, 0.08, 0.16);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
