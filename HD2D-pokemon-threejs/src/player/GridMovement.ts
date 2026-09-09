import { CONFIG } from '../config';
import type { CollisionMap } from '../map/CollisionMap';
import { DIR_VECTORS, toWorldStep, type Direction, type Input } from '../input/Input';

/**
 * 宝可梦式网格移动状态机：
 * - 轻点（短于 tapThreshold）且方向不同 → 原地转向
 * - 按住 → 碰撞通过后提交一格 tween，移动中缓冲后续输入
 */
export class GridMovement {
  tileX: number;
  tileY: number;
  facing: Direction;
  /** 移动 tween 进度 [0,1)，不在移动中为 0 */
  progress = 0;
  moving = false;

  private fromX = 0;
  private fromY = 0;
  private toX = 0;
  private toY = 0;
  /** 转向后需按住超过阈值才起步 */
  private turnTimer = 0;
  private intentDx: number;
  private intentDy: number;
  private scriptedSteps: Direction[] = [];
  private scriptedResolve?: () => void;

  constructor(
    private readonly input: Input,
    private collision: CollisionMap,
    spawn: { x: number; y: number; facing: Direction },
    private readonly onStep?: () => void,
  ) {
    this.tileX = spawn.x;
    this.tileY = spawn.y;
    this.facing = spawn.facing;
    this.intentDx = DIR_VECTORS[spawn.facing].dx;
    this.intentDy = DIR_VECTORS[spawn.facing].dy;
  }

  /** 地图传送：换碰撞网格并硬置站位，清空移动状态。 */
  reset(
    collision: CollisionMap,
    spawn: { x: number; y: number; facing: Direction },
  ): void {
    this.collision = collision;
    this.tileX = spawn.x;
    this.tileY = spawn.y;
    this.facing = spawn.facing;
    this.moving = false;
    this.progress = 0;
    this.turnTimer = 0;
    this.scriptedSteps = [];
    this.scriptedResolve = undefined;
    this.intentDx = DIR_VECTORS[spawn.facing].dx;
    this.intentDy = DIR_VECTORS[spawn.facing].dy;
  }

  /** 当前世界坐标（tile 单位，含移动插值） */
  get worldX(): number {
    return this.moving
      ? this.fromX + (this.toX - this.fromX) * this.progress
      : this.tileX;
  }

  get worldY(): number {
    return this.moving
      ? this.fromY + (this.toY - this.fromY) * this.progress
      : this.tileY;
  }

  get scriptedMoving(): boolean {
    return this.scriptedResolve !== undefined;
  }

  /** 剧情演出逐格行走；路径由剧情预先校验，不消费玩家输入。 */
  walkScripted(steps: Direction[]): Promise<void> {
    if (this.moving || this.scriptedResolve) {
      return Promise.reject(new Error('玩家正在移动，不能开始剧情路径'));
    }
    if (steps.length === 0) return Promise.resolve();
    this.scriptedSteps = [...steps];
    this.turnTimer = 0;
    return new Promise((resolve) => {
      this.scriptedResolve = resolve;
      this.startNextScriptedStep();
    });
  }

  face(direction: Direction): void {
    if (this.moving) return;
    this.facing = direction;
    this.intentDx = DIR_VECTORS[direction].dx;
    this.intentDy = DIR_VECTORS[direction].dy;
  }

  update(dt: number, cameraYaw: number): void {
    if (this.scriptedResolve) {
      this.updateScripted(dt);
      return;
    }
    if (this.moving) {
      const stepDistance = Math.hypot(this.toX - this.fromX, this.toY - this.fromY);
      const speedMultiplier = this.input.running ? CONFIG.player.runSpeedMultiplier : 1;
      this.progress += dt * speedMultiplier / (CONFIG.player.moveDuration * stepDistance);
      if (this.progress >= 1) {
        this.tileX = this.toX;
        this.tileY = this.toY;
        this.moving = false;
        this.progress = 0;
        this.onStep?.();
        // 到格立即消费仍按住的方向，连续行走不顿挫
        this.tryStart(dt, true, cameraYaw);
      }
      return;
    }
    this.tryStart(dt, false, cameraYaw);
  }

  private updateScripted(dt: number): void {
    this.progress = Math.min(1, this.progress + dt / CONFIG.player.moveDuration);
    if (this.progress < 1) return;
    this.tileX = this.toX;
    this.tileY = this.toY;
    this.moving = false;
    this.progress = 0;
    this.onStep?.();
    if (this.scriptedSteps.length > 0) {
      this.startNextScriptedStep();
      return;
    }
    const resolve = this.scriptedResolve;
    this.scriptedResolve = undefined;
    resolve?.();
  }

  private startNextScriptedStep(): void {
    const direction = this.scriptedSteps.shift();
    if (!direction) return;
    const { dx, dy } = DIR_VECTORS[direction];
    this.face(direction);
    this.fromX = this.tileX;
    this.fromY = this.tileY;
    this.toX = this.tileX + dx;
    this.toY = this.tileY + dy;
    this.moving = true;
    this.progress = 0;
  }

  private tryStart(dt: number, chained: boolean, cameraYaw: number): void {
    const input = this.input.vector;
    if (input.x === 0 && input.y === 0) {
      this.turnTimer = 0;
      return;
    }
    const inputLength = Math.hypot(input.x, input.y);
    const { dx, dy } = toWorldStep(input.x / inputLength, input.y / inputLength, cameraYaw);
    if (dx !== this.intentDx || dy !== this.intentDy) {
      // 新方向：先转向，短按只转不走
      this.intentDx = dx;
      this.intentDy = dy;
      this.facing = Math.abs(dx) > Math.abs(dy)
        ? (dx > 0 ? 'right' : 'left')
        : (dy > 0 ? 'down' : 'up');
      this.turnTimer = chained ? CONFIG.player.tapThreshold : 0;
      return;
    }
    this.turnTimer += dt;
    if (!chained && this.turnTimer < CONFIG.player.tapThreshold) return;

    const nx = this.tileX + dx;
    const ny = this.tileY + dy;
    if (this.collision.isBlocked(nx, ny)) return;
    // 对角移动不允许穿过两个 tile 之间的墙角。
    if (dx !== 0 && dy !== 0
      && (this.collision.isBlocked(this.tileX + dx, this.tileY)
        || this.collision.isBlocked(this.tileX, this.tileY + dy))) return;
    this.fromX = this.tileX;
    this.fromY = this.tileY;
    this.toX = nx;
    this.toY = ny;
    this.moving = true;
    this.progress = 0;
  }
}
