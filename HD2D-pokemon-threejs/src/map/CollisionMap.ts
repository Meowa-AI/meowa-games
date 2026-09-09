import type { MapData } from './MapData';

/**
 * 碰撞查询。静态网格来自地图数据；
 * 预留动态阻挡注册（后续 NPC 用）。
 */
export class CollisionMap {
  private readonly grid: number[][];
  private readonly width: number;
  private readonly height: number;
  private readonly dynamic = new Set<string>();

  constructor(map: MapData) {
    this.grid = map.collision;
    this.width = map.width;
    this.height = map.height;
  }

  isBlocked(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return true;
    return this.grid[y][x] === 1 || this.dynamic.has(`${x},${y}`);
  }

  addBlocker(x: number, y: number): void {
    this.dynamic.add(`${x},${y}`);
  }

  removeBlocker(x: number, y: number): void {
    this.dynamic.delete(`${x},${y}`);
  }
}
