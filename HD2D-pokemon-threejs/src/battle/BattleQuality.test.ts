import { describe, expect, it } from 'vitest';
import { chooseBattleVisualQuality } from './BattleQuality';

describe('chooseBattleVisualQuality', () => {
  it('uses the full presentation on capable devices', () => {
    expect(chooseBattleVisualQuality({
      prefersReducedMotion: false, deviceMemory: 8, hardwareConcurrency: 8,
    })).toBe('full');
  });

  it('falls back for reduced motion or constrained hardware', () => {
    expect(chooseBattleVisualQuality({
      prefersReducedMotion: true, deviceMemory: 8, hardwareConcurrency: 8,
    })).toBe('reduced');
    expect(chooseBattleVisualQuality({
      prefersReducedMotion: false, deviceMemory: 4, hardwareConcurrency: 8,
    })).toBe('reduced');
  });

  it('lets the explicit test override win', () => {
    expect(chooseBattleVisualQuality({
      override: 'full', prefersReducedMotion: true, deviceMemory: 2,
    })).toBe('full');
  });
});
