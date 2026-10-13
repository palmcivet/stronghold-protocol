import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  frameProjection,
  MISSION_PROJECTION,
  projectPoint,
  syncPerspectiveCamera,
  unprojectPoint,
} from '#runtime/camera/projection.js';
import { defined } from '#test/defined.js';

describe('board projection', () => {
  it('pitches 30° with a 40° field of view by default, framing the whole map inside the canvas', () => {
    const projection = frameProjection(9, 5, null, 10);
    if (!projection) {
      throw new Error('no projection');
    }
    expect(MISSION_PROJECTION).toEqual({ fovY: 40, pitch: 30 });
    expect(projection.pitch).toBeCloseTo(Math.PI / 6, 12);
    expect(projection.focal).toBeCloseTo(
      25 / Math.tan((20 * Math.PI) / 180),
      9,
    );
    const corners = [
      [-0.5, -0.5],
      [8.5, -0.5],
      [8.5, 4.5],
      [-0.5, 4.5],
    ].map(([x, y]) =>
      defined(projectPoint(projection, defined(x), defined(y), 0)),
    );
    const xs = corners.map((point) => point.x);
    const ys = corners.map((point) => point.y);
    // the map's bounding box fits the canvas, touches one pair of edges and is centred
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-1e-6);
    expect(Math.max(...xs)).toBeLessThanOrEqual(90 + 1e-6);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(-1e-6);
    expect(Math.max(...ys)).toBeLessThanOrEqual(50 + 1e-6);
    expect(
      Math.max(
        Math.max(...xs) - Math.min(...xs) - 90,
        Math.max(...ys) - Math.min(...ys) - 50,
      ),
    ).toBeCloseTo(0, 6);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(45, 6);
    expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(25, 6);
    // the near row looks wider than the far row
    expect(defined(corners[1]).x - defined(corners[0]).x).toBeGreaterThan(
      defined(corners[2]).x - defined(corners[3]).x,
    );
  });

  it('frames a camera rectangle into the canvas part the 2D transform shows, and takes other optics', () => {
    const projection = defined(
      frameProjection(
        10,
        10,
        { x: 2, y: 3, width: 4, height: 2, margin: 0 },
        10,
        { pitch: 45, fovY: 30 },
      ),
    );
    expect(projection.pitch).toBeCloseTo(Math.PI / 4, 12);
    const centre = defined(projectPoint(projection, 3.5, 3.5, 0));
    const a = defined(projectPoint(projection, 1.5, 2.5, 0));
    const b = defined(projectPoint(projection, 5.5, 4.5, 0));
    expect(Math.min(a.x, b.x)).toBeGreaterThanOrEqual(20 - 1e-6);
    expect(Math.max(a.x, b.x)).toBeLessThanOrEqual(60 + 1e-6);
    expect(Math.min(a.y, b.y)).toBeGreaterThanOrEqual(50 - 1e-6);
    expect(Math.max(a.y, b.y)).toBeLessThanOrEqual(70 + 1e-6);
    expect(centre.x).toBeCloseTo(40, 6);
  });

  it('unprojects a canvas pixel back to the board point at the asked height', () => {
    const projection = defined(frameProjection(9, 5, null, 10));
    for (const [x, y, z] of [
      [0, 0, 0],
      [4.2, 3.7, 0.42],
      [8, 4, 1],
    ] as const) {
      const point = defined(projectPoint(projection, x, y, z));
      const back = defined(unprojectPoint(projection, point.x, point.y, z));
      expect(back.x).toBeCloseTo(x, 9);
      expect(back.y).toBeCloseTo(y, 9);
    }
  });

  it('sets a Three camera that projects every tile centre to the same pixel', () => {
    const projection = defined(
      frameProjection(7, 4, { x: 1, y: 1, width: 5, height: 2, margin: 0 }, 16),
    );
    const camera = new PerspectiveCamera();
    syncPerspectiveCamera(camera, projection);
    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 7; x += 1) {
        const ours = defined(projectPoint(projection, x, y, 0.2));
        const ndc = new Vector3(x, 0.2, -y).project(camera);
        expect((ndc.x + 1) * 0.5 * projection.width).toBeCloseTo(ours.x, 6);
        expect((1 - ndc.y) * 0.5 * projection.height).toBeCloseTo(ours.y, 6);
      }
    }
  });
});
