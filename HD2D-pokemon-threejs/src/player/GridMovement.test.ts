import { describe, expect, it } from 'vitest';
import type { Input } from '../input/Input';
import type { CollisionMap } from '../map/CollisionMap';
import { GridMovement } from './GridMovement';

describe('GridMovement scripted walking', () => {
  it('walks a fixed path without player input and resolves on the final tile', async () => {
    const input = { vector: { x: 0, y: 0 }, running: false } as Input;
    const collision = { isBlocked: () => false } as unknown as CollisionMap;
    let completedSteps = 0;
    const movement = new GridMovement(
      input, collision, { x: 11, y: 39, facing: 'up' }, () => completedSteps++,
    );

    const finished = movement.walkScripted(['down', 'down']);
    expect(movement.scriptedMoving).toBe(true);
    movement.update(0.25, 0);
    expect([movement.tileX, movement.tileY, movement.facing]).toEqual([11, 40, 'down']);
    movement.update(0.25, 0);
    await finished;

    expect([movement.tileX, movement.tileY]).toEqual([11, 41]);
    expect(movement.scriptedMoving).toBe(false);
    expect(completedSteps).toBe(2);
  });
});
