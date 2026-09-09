export type BattleVisualQuality = 'full' | 'reduced';

export interface BattleQualitySignals {
  override?: string | null;
  prefersReducedMotion: boolean;
  deviceMemory?: number;
  hardwareConcurrency?: number;
}

/** 纯函数便于测试；显式 URL 覆盖用于低配路径的浏览器验收。 */
export function chooseBattleVisualQuality(signals: BattleQualitySignals): BattleVisualQuality {
  if (signals.override === 'full' || signals.override === 'reduced') return signals.override;
  if (signals.prefersReducedMotion) return 'reduced';
  if (signals.deviceMemory !== undefined && signals.deviceMemory <= 4) return 'reduced';
  if (signals.hardwareConcurrency !== undefined && signals.hardwareConcurrency <= 4) return 'reduced';
  return 'full';
}

export function detectBattleVisualQuality(): BattleVisualQuality {
  const memoryNavigator = navigator as Navigator & { deviceMemory?: number };
  return chooseBattleVisualQuality({
    override: new URLSearchParams(location.search).get('battleQuality'),
    prefersReducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    deviceMemory: memoryNavigator.deviceMemory,
    hardwareConcurrency: navigator.hardwareConcurrency,
  });
}
