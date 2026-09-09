export type BattleEase = (progress: number) => number;

interface TimelineTask {
  elapsed: number;
  duration: number;
  update: (progress: number) => void;
  ease: BattleEase;
  resolve: () => void;
}

export const battleEase = {
  linear: (progress: number): number => progress,
  outCubic: (progress: number): number => 1 - (1 - progress) ** 3,
  inCubic: (progress: number): number => progress ** 3,
  inOutCubic: (progress: number): number => progress < 0.5
    ? 4 * progress ** 3
    : 1 - (-2 * progress + 2) ** 3 / 2,
  outBack: (progress: number): number => {
    const overshoot = 1.70158;
    return 1 + (overshoot + 1) * (progress - 1) ** 3
      + overshoot * (progress - 1) ** 2;
  },
} satisfies Record<string, BattleEase>;

/**
 * 由游戏主循环推进的轻量时间线。它不创建独立 requestAnimationFrame，
 * 因而暂停、切图和 BattleStage 销毁都与现有渲染循环保持一致。
 */
export class BattleTimeline {
  private readonly tasks = new Set<TimelineTask>();

  tween(
    duration: number,
    update: (progress: number) => void,
    ease: BattleEase = battleEase.linear,
  ): Promise<void> {
    if (duration <= 0) {
      update(1);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      update(ease(0));
      this.tasks.add({ elapsed: 0, duration, update, ease, resolve });
    });
  }

  delay(duration: number): Promise<void> {
    return this.tween(duration, () => undefined);
  }

  update(dt: number): void {
    for (const task of [...this.tasks]) {
      task.elapsed = Math.min(task.duration, task.elapsed + dt);
      task.update(task.ease(task.elapsed / task.duration));
      if (task.elapsed < task.duration) continue;
      this.tasks.delete(task);
      task.resolve();
    }
  }

  clear(): void {
    for (const task of this.tasks) task.resolve();
    this.tasks.clear();
  }
}
