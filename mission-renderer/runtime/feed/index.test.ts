import {
  type BattleEvent,
  type BattleSnapshot,
  TICK,
  type UnitSnapshot,
} from 'arknights-mission-core';
import { describe, expect, it } from 'vitest';
import { createMissionFeed, moveStart } from '#runtime/feed/index.js';

function unit(id: string, x: number): UnitSnapshot {
  return {
    id,
    side: 'ally',
    kind: 'operator',
    x,
    y: 0,
    facing: 'RIGHT',
    height: 0,
    attributes: { hp: 1, maxHp: 1 },
    maxHp: 1,
    tags: [],
    attackRange: [],
    deployPositions: [],
    elements: {},
    blocking: [],
    blockedBy: null,
    skills: [],
    shield: 0,
    downed: false,
    redeploy: null,
    unbalanceUntil: null,
    components: {},
  };
}

function frame(tick: number, x: number): BattleSnapshot {
  return { tick, units: [unit('guard', x)] };
}

function event(tick: number): BattleEvent {
  return {
    tick,
    type: 'attack',
    data: { unitId: 'guard', targetIds: [], cancel: false },
  };
}

describe('local feed', () => {
  it('trails the newest frame by the delay and interpolates units between frames', () => {
    const feed = createMissionFeed({ speed: 1, delay: 0.5 });

    feed.push(frame(0, 0));
    feed.push(frame(100, 100));
    feed.advance(0);
    const sample = feed.sample();
    if (!sample) {
      throw new Error('no sample');
    }

    const time = 100 * TICK - 0.5;
    const alpha = time / (100 * TICK);
    expect(sample.time).toBeCloseTo(time, 9);
    expect(sample.units[0]?.x).toBeCloseTo(100 * alpha, 6);
    expect(sample.moving.has('guard')).toBe(true);
  });

  it('holds a unit that is missing from the newer frame until the clock reaches it', () => {
    const feed = createMissionFeed({ speed: 1, delay: 0.5 });

    feed.push({ tick: 0, units: [unit('guard', 2), unit('gone', 5)] });
    feed.push({ tick: 100, units: [unit('guard', 2)] });
    const sample = feed.sample();

    expect(sample?.units.map((item) => item.id)).toContain('gone');
  });

  it('releases an event once the render clock passes its tick', () => {
    const feed = createMissionFeed({ speed: 1, delay: 0.5 });

    feed.push(frame(0, 0));
    feed.push(frame(100, 0));
    feed.advance(0);
    feed.pushEvent(event(1));
    feed.pushEvent(event(100));

    const released = feed.takeEvents();
    expect(released.map((item) => item.tick)).toEqual([1]);
    expect(feed.takeEvents()).toEqual([]);
  });

  it("advances the render clock at the battle's speed and never past the newest frame", () => {
    const feed = createMissionFeed({ speed: 2, delay: 0 });

    feed.push(frame(0, 0));
    feed.push(frame(10, 10));
    const before = feed.renderTime;
    feed.advance(0.1);

    expect(feed.renderTime).toBeGreaterThanOrEqual(before);
    expect(feed.renderTime).toBeLessThanOrEqual(feed.newestTime);
  });

  it('starts over when the stream restarts with an earlier tick', () => {
    const feed = createMissionFeed({ speed: 1, delay: 0 });

    feed.push(frame(200, 20));
    feed.pushEvent(event(200));
    feed.push(frame(5, 1));
    const sample = feed.sample();

    expect(sample?.snapshot.tick).toBe(5);
    expect(feed.takeEvents()).toEqual([]);
  });

  it('runs past the newest frame along the last velocity for at most the extrapolation window, then holds', () => {
    // no delay to steer back to: the clock runs on at the speed and stops 0.12 s past the newest frame
    const feed = createMissionFeed({ speed: 1, delay: 0 });
    feed.push(frame(0, 0));
    feed.push(frame(3, 0.3));
    const newest = 3 * TICK;
    let passed = false;
    for (let step = 0; step < 40; step += 1) {
      feed.advance(0.02);
      const sample = feed.sample();
      expect(sample?.time).toBe(feed.renderTime);
      if (feed.renderTime > newest) {
        passed = true;
        expect(sample?.units[0]?.x).toBeCloseTo(
          0.3 + 3 * (feed.renderTime - newest),
          9,
        );
      }
    }
    expect(passed).toBe(true);
    expect(feed.renderTime).toBeLessThanOrEqual(newest + 0.12 + 1e-12);
    expect(feed.sample()?.units[0]?.x).toBeLessThanOrEqual(
      0.3 + 3 * 0.12 + 1e-9,
    );
  });

  it('keeps still a unit the newest frame shows blocked, stunned, standing or jumping, and honours a zero window', () => {
    const held = (patch: Partial<UnitSnapshot>, x = 0.3) => {
      const feed = createMissionFeed({ speed: 1, delay: 0 });
      feed.push(frame(0, 0));
      feed.push({ tick: 3, units: [{ ...unit('guard', x), ...patch }] });
      for (let step = 0; step < 40; step += 1) {
        feed.advance(0.02);
      }
      expect(feed.renderTime).toBeGreaterThan(3 * TICK);
      return feed.sample()?.units[0]?.x;
    };
    expect(held({ blockedBy: 'e' })).toBe(0.3);
    expect(held({ tags: ['stun'] })).toBe(0.3);
    expect(held({ downed: true })).toBe(0.3);
    expect(
      held({ components: { 'attack:stand': { until: 9, cutAt: null } } }),
    ).toBe(0.3);
    expect(held({}, 3)).toBe(3);
    const off = createMissionFeed({ speed: 1, delay: 0, maxExtrapolate: 0 });
    off.push(frame(0, 0));
    off.push(frame(3, 0.3));
    for (let step = 0; step < 40; step += 1) {
      off.advance(0.02);
    }
    expect(off.sample()?.time).toBeCloseTo(3 * TICK, 9);
    expect(off.sample()?.units[0]?.x).toBeCloseTo(0.3, 9);
  });

  it('holds a unit still until its attack stand ends inside the interval, unless a cut lands there or the stand outlasts it', () => {
    const standing = (until: number | null, cutAt: number | null = null) => ({
      ...unit('guard', 0),
      components: { 'attack:stand': { until, cutAt } },
    });
    expect(moveStart(standing(2), 0, 4 * TICK)).toBeCloseTo(2 * TICK, 12);
    expect(moveStart(standing(4), 0, 4 * TICK)).toBeCloseTo(4 * TICK, 12);
    expect(moveStart(standing(9), 0, 4 * TICK)).toBe(0);
    expect(moveStart(standing(2, 1), 0, 4 * TICK)).toBe(0);
    expect(moveStart(standing(2, 0), 0, 4 * TICK)).toBeCloseTo(2 * TICK, 12);
    expect(moveStart(standing(null), 0, 4 * TICK)).toBe(0);
    expect(moveStart(unit('guard', 0), 0, 4 * TICK)).toBe(0);
  });
});
