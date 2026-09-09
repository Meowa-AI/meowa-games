import * as THREE from 'three';
import type { Direction } from '../input/Input';

/**
 * 行走图 UV 动画（pret/pokeemerald walking.png 布局，1 行 9 帧 16x32）：
 *   0 朝下站立, 1 朝上站立, 2 侧面站立,
 *   3/4 朝下迈步 A/B, 5/6 朝上迈步 A/B, 7/8 侧面迈步 A/B
 * 侧面帧原图朝向由 SIDE_FACES_LEFT 声明，另一侧用 UV 负 repeat 镜像。
 */
const FRAME_COUNT = 9;
const SIDE_FACES_LEFT = true;

const FRAMES: Record<Direction, { idle: number; stepA: number; stepB: number }> = {
  down: { idle: 0, stepA: 3, stepB: 4 },
  up: { idle: 1, stepA: 5, stepB: 6 },
  left: { idle: 2, stepA: 7, stepB: 8 },
  right: { idle: 2, stepA: 7, stepB: 8 },
};

export class SpriteAnimator {
  private readonly texture: THREE.Texture;
  /** 迈步脚交替（每走一格换脚） */
  private parity = false;

  constructor(texture: THREE.Texture) {
    this.texture = texture;
    this.texture.repeat.set(1 / FRAME_COUNT, 1);
  }

  private setFrame(frame: number, mirror: boolean): void {
    if (mirror) {
      this.texture.repeat.x = -1 / FRAME_COUNT;
      this.texture.offset.x = (frame + 1) / FRAME_COUNT;
    } else {
      this.texture.repeat.x = 1 / FRAME_COUNT;
      this.texture.offset.x = frame / FRAME_COUNT;
    }
  }

  private mirror(dir: Direction): boolean {
    if (dir === 'left') return !SIDE_FACES_LEFT;
    if (dir === 'right') return SIDE_FACES_LEFT;
    return false;
  }

  showIdle(dir: Direction): void {
    this.setFrame(FRAMES[dir].idle, this.mirror(dir));
  }

  /**
   * 行走中按 tween 进度取帧（前半程迈步、后半程回站立），
   * 与 GBA 一致的节奏；每格交替左右脚。
   */
  showWalk(dir: Direction, progress: number): void {
    const f = FRAMES[dir];
    const step = this.parity ? f.stepB : f.stepA;
    this.setFrame(progress < 0.5 ? step : f.idle, this.mirror(dir));
  }

  /** 完成一格移动时调用，交替迈步脚 */
  onStepComplete(): void {
    this.parity = !this.parity;
  }
}
