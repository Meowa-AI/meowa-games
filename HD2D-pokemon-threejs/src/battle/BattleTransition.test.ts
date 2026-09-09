import { describe, expect, it } from 'vitest';
import {
  createPokeballSweepLayout,
  getPokeballRollRotation,
  BATTLE_FLASH_COUNT,
  POKEBALL_ROLL_ASSET,
} from './BattleTransition';
import {
  BATTLE_ENTRY_POKEBALL_ASSET, BATTLE_ENTRY_RELEASE_FRAMES, getCaptureOutcomeAsset,
} from './BattleEntryAssets';

describe('classic Pokeball battle transition', () => {
  it('flashes exactly three times before the Pokeball wipe', () => {
    expect(BATTLE_FLASH_COUNT).toBe(3);
  });

  it('uses the supplied closed New Pokeball sprite instead of Release frames', () => {
    expect(POKEBALL_ROLL_ASSET).toMatch(/SPR_NewPokeball1\.png$/);
    expect(POKEBALL_ROLL_ASSET).not.toContain('Release');
  });

  it('reserves all eleven Release frames for the in-battle summon animation', () => {
    expect(BATTLE_ENTRY_POKEBALL_ASSET).toMatch(/SPR_NewPokeball1\.png$/);
    expect(BATTLE_ENTRY_RELEASE_FRAMES).toHaveLength(11);
    expect(BATTLE_ENTRY_RELEASE_FRAMES[0]).toMatch(/Release1\.png$/);
    expect(BATTLE_ENTRY_RELEASE_FRAMES[10]).toMatch(/Release11\.png$/);
  });

  it('keeps a successful capture closed and a failed capture open', () => {
    expect(getCaptureOutcomeAsset(true)).toBe(BATTLE_ENTRY_POKEBALL_ASSET);
    expect(getCaptureOutcomeAsset(false)).toBe(BATTLE_ENTRY_RELEASE_FRAMES[10]);
  });

  it('keeps both balls centered in their half of the screen at an integer pixel scale', () => {
    expect(createPokeballSweepLayout(1280, 720)).toEqual({
      ballSize: 160,
      upperY: 180,
      lowerY: 540,
    });
    const compact = createPokeballSweepLayout(640, 360);
    expect(compact.ballSize % 32).toBe(0);
    expect(compact.upperY).toBe(90);
    expect(compact.lowerY).toBe(270);
  });

  it('rotates both balls around center in opposite directions', () => {
    expect(getPokeballRollRotation(0)).toBe(0);
    expect(getPokeballRollRotation(210)).toBeCloseTo(Math.PI);
    expect(getPokeballRollRotation(210, true)).toBeCloseTo(-Math.PI);
    expect(getPokeballRollRotation(420)).toBeCloseTo(Math.PI * 2);
  });
});
