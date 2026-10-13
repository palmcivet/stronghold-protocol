import { TICK } from 'arknights-mission-core';
import { describe, expect, it } from 'vitest';
import {
  MISSION_PROJECTILE,
  MISSION_TILES,
  tilesOpacity,
} from '#effect/shape.js';
import { createMissionStage } from '#runtime/stage/index.js';
import { recordDuel } from '#test/actor/fixture.js';
import { defined } from '#test/defined.js';

function staged() {
  const stage = createMissionStage(null);
  const [first] = recordDuel(0, 1000);
  stage.dispatch({ type: 'push-snapshot', snapshot: defined(first).snapshot });
  stage.update(TICK);
  const push = (type: string, data: Record<string, unknown>) =>
    stage.dispatch({
      type: 'push-event',
      event: { tick: 0, type, data } as never,
    });
  return { stage, push };
}

describe('engine shapes', () => {
  it('flies a shot from the shooter to its target at the projectile speed in game seconds', () => {
    const { stage, push } = staged();
    stage.dispatch({ type: 'set-speed', speed: 1 });
    push('projectile', { id: 'p', sourceId: 'g', targetId: 'e' });
    stage.update(0);
    expect(stage.effects.live().get('mission:projectile')).toBe(1);
    // one tile apart: 1 / 12 game seconds of flight
    stage.update(0.5 / MISSION_PROJECTILE.speed);
    expect(stage.effects.live().get('mission:projectile')).toBe(1);
    stage.update(0.6 / MISSION_PROJECTILE.speed);
    expect(stage.effects.live().has('mission:projectile')).toBe(false);
  });

  it('sparks on a landed hit, not on a cancelled one', () => {
    const { stage, push } = staged();
    const hit = (cancel: boolean) => ({
      sourceId: 'g',
      creditId: 'g',
      targetId: 'e',
      amount: 10,
      kind: 'physical',
      cancel,
      sourceless: false,
    });
    push('hit', hit(true));
    stage.update(0);
    expect(stage.effects.live().has('mission:hit-spark')).toBe(false);
    push('hit', hit(false));
    stage.update(0);
    expect(stage.effects.live().get('mission:hit-spark')).toBe(1);
  });

  it('dissolves a unit that leaves, and shatters a device instead', () => {
    const { stage, push } = staged();
    push('removed', { unitId: 'e' });
    stage.update(0);
    expect(stage.effects.live().get('mission:death-dissolve')).toBe(1);
    expect(stage.effects.live().has('mission:shatter')).toBe(false);
  });

  it('fades tile flashes out, pulses warnings, and eases both out over the last stretch', () => {
    expect(tilesOpacity(0, 1, false)).toBeCloseTo(MISSION_TILES.fade);
    expect(tilesOpacity(0.5, 1, false)).toBeCloseTo(MISSION_TILES.fade / 2);
    expect(tilesOpacity(0, 1, true)).toBeCloseTo(MISSION_TILES.warnBase);
    expect(tilesOpacity(0.95, 1, false)).toBeLessThan(
      (0.05 * MISSION_TILES.fade) / MISSION_TILES.tail + 1e-9,
    );
    expect(tilesOpacity(1, 1, true)).toBe(0);
  });
});
