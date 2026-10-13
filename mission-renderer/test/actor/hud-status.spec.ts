import {
  type BattleSnapshot,
  BOSS,
  ELITE,
  SILENCE,
  STUN,
  TICK,
  type UnitSnapshot,
} from 'arknights-mission-core';
import { Texture } from 'three';
import { describe, expect, it } from 'vitest';
import { MISSION_HUD_GHOST_DRAIN } from '#actor/hud/index.js';
import { createMissionStage } from '#runtime/stage/index.js';
import { recordDuel } from '#test/actor/fixture.js';
import { defined } from '#test/defined.js';

const patch = (
  snapshot: BattleSnapshot,
  id: string,
  change: Partial<UnitSnapshot>,
): BattleSnapshot => ({
  ...snapshot,
  units: snapshot.units.map((unit) =>
    unit.id === id ? { ...unit, ...change } : unit,
  ),
});

describe('hud status', () => {
  it('shows the icons of the status tags in table order', () => {
    const stage = createMissionStage(null);
    const [first] = recordDuel(0, 1000);
    const enemy = defined(
      defined(first).snapshot.units.find((unit) => unit.id === 'e'),
    );
    stage.dispatch({
      type: 'push-snapshot',
      snapshot: patch(defined(first).snapshot, 'e', {
        tags: [...enemy.tags, SILENCE.id, STUN.id],
      }),
    });
    stage.update(TICK);
    expect(stage.hud.icons('e')).toEqual(['stun', 'silence']);
    expect(stage.hud.icons('g')).toEqual([]);
  });

  it('frames boss and elite bars and widens the boss bar', () => {
    const stage = createMissionStage(null);
    const [first] = recordDuel(0, 1000);
    let snapshot = patch(defined(first).snapshot, 'e', {
      tags: [BOSS.id, ELITE.id],
    });
    snapshot = patch(snapshot, 'g', { tags: [ELITE.id] });
    stage.dispatch({ type: 'push-snapshot', snapshot });
    stage.update(TICK);
    expect(stage.hud.frame('e')).toBe(BOSS.id);
    expect(stage.hud.frame('g')).toBe(ELITE.id);
  });

  it('drains the ghost bar toward the health bar at a fixed rate', () => {
    const stage = createMissionStage(null);
    const recorded = recordDuel(120, 1000);
    stage.dispatch({
      type: 'push-snapshot',
      snapshot: defined(recorded[0]).snapshot,
    });
    stage.update(TICK);
    expect(stage.hud.ghost('e')).toBe(1);
    const hpOf = (snapshot: BattleSnapshot): number => {
      const hp = snapshot.units.find((unit) => unit.id === 'e')?.attributes.hp;
      if (hp === undefined) {
        throw new Error('enemy hp missing');
      }
      return hp;
    };
    const hit = defined(recorded.find((tick) => hpOf(tick.snapshot) < 1400));
    const hp = hpOf(hit.snapshot) / 1400;
    stage.dispatch({ type: 'push-snapshot', snapshot: hit.snapshot });
    stage.update(0.1);
    expect(stage.hud.bar('e')?.hp).toBeCloseTo(hp, 6);
    expect(stage.hud.ghost('e')).toBeCloseTo(
      1 - MISSION_HUD_GHOST_DRAIN * 0.1,
      6,
    );
    stage.update(1);
    expect(stage.hud.ghost('e')).toBeCloseTo(hp, 6);
  });

  it('draws a redeploy ring with shared digit textures while downed', () => {
    const made: number[] = [];
    const stage = createMissionStage(null, {
      hudStyle: {
        digitTexture: (digit) => {
          made.push(digit);
          return new Texture();
        },
      },
    });
    const [first] = recordDuel(0, 1000);
    const down = (elapsed: number) =>
      patch(defined(first).snapshot, 'g', {
        downed: true,
        redeploy: { elapsed, duration: 20 },
      });
    stage.dispatch({ type: 'push-snapshot', snapshot: down(5) });
    stage.update(TICK);
    expect(stage.hud.ring('g')).toEqual({ left: 0.75, seconds: 15 });
    expect(stage.hud.bar('g')).toBeNull();
    stage.dispatch({ type: 'push-snapshot', snapshot: down(19.5) });
    stage.update(TICK);
    expect(stage.hud.ring('g')).toEqual({ left: 0.025, seconds: 1 });
    expect(made).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    stage.dispatch({
      type: 'push-snapshot',
      snapshot: defined(first).snapshot,
    });
    stage.update(TICK);
    expect(stage.hud.ring('g')).toBeNull();
  });
});
