import { describe, expect, it } from 'vitest';
import { buildCameraTour } from './CameraRig';

describe('buildCameraTour', () => {
  it('travels from the southern town through the route to the northern town', () => {
    const frames = buildCameraTour({ width: 20, height: 60 });

    expect(frames).toHaveLength(4);
    expect(frames[0].pose.z).toBeGreaterThan(frames[1].pose.z);
    expect(frames[1].pose.z).toBeGreaterThan(frames[2].pose.z);
    expect(frames[2].pose.z).toBeGreaterThan(frames[3].pose.z);
    expect(frames[3].pose.distance).toBeLessThan(frames[2].pose.distance);
  });

  it('scales the route down for compact interior maps', () => {
    const frames = buildCameraTour({ width: 12, height: 10, cameraDistance: 9 });

    expect(frames.every(({ pose }) => pose.x >= 1 && pose.x <= 11)).toBe(true);
    expect(frames.every(({ pose }) => pose.z >= 1 && pose.z <= 9)).toBe(true);
    expect(Math.max(...frames.map(({ pose }) => pose.distance))).toBeLessThan(20);
  });
});
