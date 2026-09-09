export type Direction = 'down' | 'up' | 'left' | 'right';

const KEY_TO_DIR: Record<string, Direction> = {
  ArrowDown: 'down', KeyS: 'down',
  ArrowUp: 'up', KeyW: 'up',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
};

const RUN_KEYS = new Set(['ShiftLeft', 'ShiftRight']);
const ACTION_KEYS = new Set(['Space']);

export const DIR_VECTORS: Record<Direction, { dx: number; dy: number }> = {
  down: { dx: 0, dy: 1 },
  up: { dx: 0, dy: -1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

/**
 * 将屏幕输入向量按相机水平环绕角旋转，并量化为八方向世界网格步长。
 * yaw = 0 时相机位于地图南侧，因此屏幕上方对应世界 -Y。
 */
export function toWorldStep(
  screenX: number,
  screenY: number,
  cameraYaw: number,
): { dx: number; dy: number } {
  const forward = -screenY;
  const worldX = forward * -Math.sin(cameraYaw) + screenX * Math.cos(cameraYaw);
  const worldY = forward * -Math.cos(cameraYaw) - screenX * Math.sin(cameraYaw);

  return { dx: Math.round(worldX), dy: Math.round(worldY) };
}

/** 将角色的世界朝向转换为当前相机看到的屏幕朝向。 */
export function toScreenDirection(direction: Direction, cameraYaw: number): Direction {
  const { dx: worldX, dy: worldY } = DIR_VECTORS[direction];
  const screenX = worldX * Math.cos(cameraYaw) - worldY * Math.sin(cameraYaw);
  const screenY = worldX * Math.sin(cameraYaw) + worldY * Math.cos(cameraYaw);

  if (Math.abs(screenX) > Math.abs(screenY)) return screenX > 0 ? 'right' : 'left';
  return screenY > 0 ? 'down' : 'up';
}

/**
 * 键盘输入：维护按下的方向键栈，最后按下的优先。
 */
export class Input {
  private readonly held: Direction[] = [];
  private readonly pressedKeys = new Set<string>();
  private readonly pressedRunKeys = new Set<string>();
  private actionQueued = false;
  private actionHeld = false;

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (ACTION_KEYS.has(e.code)) {
        e.preventDefault();
        if (!this.actionHeld) this.actionQueued = true;
        this.actionHeld = true;
        return;
      }
      if (RUN_KEYS.has(e.code)) {
        this.pressedRunKeys.add(e.code);
        return;
      }
      const dir = KEY_TO_DIR[e.code];
      if (!dir || this.pressedKeys.has(e.code)) return;
      this.pressedKeys.add(e.code);
      this.held.push(dir);
    });
    window.addEventListener('keyup', (e) => {
      if (ACTION_KEYS.has(e.code)) {
        e.preventDefault();
        this.actionHeld = false;
        return;
      }
      if (RUN_KEYS.has(e.code)) {
        this.pressedRunKeys.delete(e.code);
        return;
      }
      const dir = KEY_TO_DIR[e.code];
      if (!dir) return;
      this.pressedKeys.delete(e.code);
      // 仅当没有其他按键映射到同方向时才移除
      const stillHeld = [...this.pressedKeys].some((k) => KEY_TO_DIR[k] === dir);
      if (!stillHeld) {
        const i = this.held.lastIndexOf(dir);
        if (i >= 0) this.held.splice(i, 1);
      }
    });
    window.addEventListener('blur', () => {
      this.held.length = 0;
      this.pressedKeys.clear();
      this.pressedRunKeys.clear();
      this.actionHeld = false;
      this.actionQueued = false;
    });
  }

  /** 当前生效的方向（最后按下的），无按键返回 null */
  get direction(): Direction | null {
    return this.held.length ? this.held[this.held.length - 1] : null;
  }

  /** 当前屏幕输入向量；同时按水平和垂直方向时保留对角输入。 */
  get vector(): { x: number; y: number } {
    const isHeld = (direction: Direction) =>
      [...this.pressedKeys].some((key) => KEY_TO_DIR[key] === direction);
    return {
      x: Number(isHeld('right')) - Number(isHeld('left')),
      y: Number(isHeld('down')) - Number(isHeld('up')),
    };
  }

  /** 按住任一 Shift 键时进入跑步状态。 */
  get running(): boolean {
    return this.pressedRunKeys.size > 0;
  }

  /** 消费一次空格键按下边沿；按住不会连续触发。 */
  consumeAction(): boolean {
    const queued = this.actionQueued;
    this.actionQueued = false;
    return queued;
  }
}
