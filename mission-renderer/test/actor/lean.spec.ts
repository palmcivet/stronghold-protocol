import { Euler, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createActorWorld, leanFor } from '#actor/entity/index.js';
import { createHudLayer } from '#actor/hud/index.js';
import {
  frameProjection,
  syncPerspectiveCamera,
} from '#runtime/camera/projection.js';
import { createMissionStage } from '#runtime/stage/index.js';
import { recordDuel } from '#test/actor/fixture.js';
import { defined } from '#test/defined.js';

/** The direction an actor's plane faces once leaned, against the direction the camera looks. */
function facing(pitch: number): number {
  const projection = defined(frameProjection(5, 5, null, 10, { pitch }));
  const camera = new PerspectiveCamera();
  syncPerspectiveCamera(camera, projection);
  const look = camera.getWorldDirection(new Vector3());
  const normal = new Vector3(0, 0, 1).applyEuler(
    new Euler(leanFor(pitch), 0, 0),
  );
  return normal.dot(look);
}

describe('actor lean', () => {
  it('turns actor planes to face the camera head-on, whatever the pitch', () => {
    expect(facing(30)).toBeCloseTo(-1, 9);
    expect(facing(50)).toBeCloseTo(-1, 9);
  });

  it('leans the actors and their bars by the pitch the world is given', () => {
    const world = createActorWorld({ pitch: 45 });
    expect(world.lean).toBeCloseTo(-Math.PI / 4, 12);
    const stage = createMissionStage(null);
    const [first] = recordDuel(0, 1000);
    stage.dispatch({
      type: 'push-snapshot',
      snapshot: defined(first).snapshot,
    });
    stage.update(1 / 30);
    const root = defined(stage.actors.actors.get('g')).root;
    expect(root.rotation.x).toBeCloseTo(leanFor(30), 12);
    const hud = createHudLayer(world);
    expect(hud.layer.children).toEqual([]);
    const bars: number[] = [];
    stage.hud.layer.traverse((child) => {
      if (child.parent === stage.hud.layer) {
        bars.push(child.rotation.x);
      }
    });
    expect(bars.length).toBeGreaterThan(0);
    for (const lean of bars) {
      expect(lean).toBeCloseTo(leanFor(30), 12);
    }
  });
});
