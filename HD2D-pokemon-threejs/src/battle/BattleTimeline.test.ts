import { describe, expect, it, vi } from 'vitest';
import { BattleTimeline } from './BattleTimeline';

describe('BattleTimeline', () => {
  it('is advanced only by the game loop and resolves at the requested duration', async () => {
    const timeline = new BattleTimeline();
    const update = vi.fn();
    let resolved = false;
    const animation = timeline.tween(0.5, update).then(() => { resolved = true; });

    timeline.update(0.2);
    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(update).toHaveBeenLastCalledWith(0.4);

    timeline.update(0.3);
    await animation;
    expect(resolved).toBe(true);
    expect(update).toHaveBeenLastCalledWith(1);
  });

  it('releases pending animations when the stage is cleared', async () => {
    const timeline = new BattleTimeline();
    const animation = timeline.delay(10);
    timeline.clear();
    await expect(animation).resolves.toBeUndefined();
  });
});
