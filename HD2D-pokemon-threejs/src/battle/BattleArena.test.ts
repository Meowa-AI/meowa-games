import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CollisionMap } from '../map/CollisionMap';
import type { MapData } from '../map/MapData';
import { selectBattleArena } from './BattleArena';

function map(collision: number[][], interior = false): MapData {
  return {
    id: interior ? 'room' : 'route', width: collision[0].length, height: collision.length,
    groundTexture: '', collision, props: [], npcs: [],
    spawn: { x: 1, y: 1, facing: 'down' },
    interior: interior ? {
      floor: { x: 1, y: 1, width: 6, height: 6 },
      wall: {
        height: 3, thickness: 0.2, northZ: 1, northTexture: '', sideTexture: '',
        capColor: 0, baseColor: 0,
      },
      furniture: [],
    } : undefined,
  };
}

describe('selectBattleArena', () => {
  it('uses an authored map center and scene kind', () => {
    const data = map(Array.from({ length: 12 }, () => Array(12).fill(0)));
    data.battle = { kind: 'special', centers: [[7.5, 8.25]] };
    const arena = selectBattleArena(data, new CollisionMap(data), new THREE.Vector3());
    expect(arena.kind).toBe('special');
    expect(arena.center.toArray()).toEqual([7.5, 0, 8.25]);
  });

  it('searches outward for a clear area when the player is beside obstacles', () => {
    const grid = Array.from({ length: 11 }, () => Array(11).fill(0));
    grid[5][5] = 1;
    const data = map(grid);
    const arena = selectBattleArena(
      data, new CollisionMap(data), new THREE.Vector3(5.5, 0, 5.5),
    );
    expect(arena.center.toArray()).not.toEqual([5.5, 0, 5.5]);
  });

  it('selects the interior profile automatically and supports cave overrides', () => {
    const data = map(Array.from({ length: 10 }, () => Array(10).fill(0)), true);
    expect(selectBattleArena(data, new CollisionMap(data), new THREE.Vector3()).kind)
      .toBe('interior');
    expect(selectBattleArena(data, new CollisionMap(data), new THREE.Vector3(), 'cave').kind)
      .toBe('cave');
  });
});
