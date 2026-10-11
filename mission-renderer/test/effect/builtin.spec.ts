import { TICK } from 'arknights-mission-core';
import { describe, expect, it } from 'vitest';
import { createMissionStage } from '#runtime/stage/index.js';
import { recordDuel } from '#test/actor/fixture.js';

describe('engine effect kinds', () => {
  it('rings a unit as it is deployed', () => {
    const stage = createMissionStage(null);
    const [first] = recordDuel(0, 1000);
    stage.dispatch({ type: 'push-snapshot', snapshot: first!.snapshot });
    stage.dispatch({
      type: 'push-event',
      event: { tick: 0, type: 'deploy', data: { unitId: 'g' } },
    });
    stage.update(TICK);
    expect(stage.effects.live().get('mission:deploy-ring')).toBe(1);
    expect(
      stage.effects.layer.children.map((child) => child.position.toArray()),
    ).toEqual([[0, 0.01, -0]]);
  });

  it('flashes under a unit as it takes damage, then fades and returns the flash to the pool', () => {
    const stage = createMissionStage(null);
    const duel = recordDuel(40, 1000);
    const hitAt = duel.findIndex((tick) =>
      tick.events.some((event) => event.type === 'damaged'),
    );
    expect(hitAt).toBeGreaterThan(0);
    for (const tick of duel.slice(0, hitAt + 1)) {
      stage.dispatch({ type: 'push-snapshot', snapshot: tick.snapshot });
      for (const event of tick.events) {
        stage.dispatch({ type: 'push-event', event });
      }
      stage.update(TICK);
    }
    expect(stage.effects.live().get('mission:hit-flash')).toBe(1);
    const positions = () =>
      stage.effects.layer.children.map((child) => child.position.toArray());
    expect(positions()).toContainEqual([1, 0.02, -0]);
    stage.update(0.25);
    expect(stage.effects.live().has('mission:hit-flash')).toBe(false);
    expect(positions()).not.toContainEqual([1, 0.02, -0]);
    expect(stage.effects.idle('mission:hit-flash')).toBe(1);
  });
});
