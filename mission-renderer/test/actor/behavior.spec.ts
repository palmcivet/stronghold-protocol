import type { BattleEvent, UnitSnapshot } from 'arknights-mission-core';
import { describe, expect, it } from 'vitest';
import {
  type ActorFrame,
  createActorWorld,
  MISSION_ACTOR_DIE_SECONDS,
  MISSION_ACTOR_RECOIL,
  MISSION_ACTOR_SLIDE,
} from '#actor/entity/index.js';
import type { MissionAppearance } from '#contract/appearance.js';
import type { MissionSkeletonData } from '#port/skeleton.js';
import {
  appearance,
  fakeSkeleton,
  ROLES,
  recordDuel,
} from '#test/actor/fixture.js';
import { defined } from '#test/defined.js';

const [first] = recordDuel(0, 1000);
const base = defined(
  defined(first).snapshot.units.find((unit) => unit.id === 'e'),
);
const unitAt = (patch: Partial<UnitSnapshot> = {}): UnitSnapshot => ({
  ...base,
  ...patch,
});

function world(
  durations: Readonly<Record<string, number>> = {},
  look: Partial<MissionAppearance> = {},
) {
  const skeleton = fakeSkeleton();
  const resources = {
    spine: async (): Promise<MissionSkeletonData> => ({
      animations: ['Idle', 'Start', 'Attack', 'Die', 'Move', 'IdleB'],
      durations,
      clipping: false,
    }),
    release: () => undefined,
  };
  const actors = createActorWorld({ skeleton: skeleton.runtime, resources });
  actors.setAppearances({ e: appearance('spine:e', look) });
  const step = async (
    unit: UnitSnapshot | null,
    events: readonly Omit<BattleEvent, 'tick'>[] = [],
    deltaSeconds = 0.1,
    speed = 1,
  ) => {
    const frame: ActorFrame = {
      deltaSeconds,
      speed,
      units: unit ? [unit] : [],
      moving: new Set(),
      events: events.map((event) => ({ tick: 0, ...event }) as BattleEvent),
    };
    for (const system of actors.systems) {
      system.run(frame);
    }
    await Promise.resolve();
  };
  const actor = () => actors.actors.get('e');
  const calls = () => skeleton.instances[0]?.calls ?? [];
  return { actors, step, actor, calls };
}

describe('model forms', () => {
  it('plays the clips of the first form in force and switches as the tags change, without a change clip', async () => {
    const hidden = { ...ROLES, idle: 'IdleB' };
    const w = world(
      {},
      {
        forms: [
          {
            tags: ['stealth'],
            without: ['reveal', 'stealth-off'],
            blocked: false,
            roles: hidden,
          },
        ],
      },
    );
    await w.step(unitAt({ tags: ['stealth'] }));
    await w.step(unitAt({ tags: ['stealth'] }));
    expect(w.calls()).toContain('play 0 IdleB loop');
    await w.step(unitAt({ tags: ['stealth'], blockedBy: 'g' }));
    expect(w.calls().at(-1)).toBe('play 0 Idle loop');
    await w.step(unitAt({ tags: ['reveal', 'stealth'] }));
    expect(w.calls().at(-1)).toBe('play 0 Idle loop');
    await w.step(unitAt({ tags: ['stealth'] }));
    expect(w.calls().at(-1)).toBe('play 0 IdleB loop');
  });
});

describe('push and pull slides', () => {
  it('slides the event duration in game seconds, decelerating, and keeps the facing it had', async () => {
    const w = world();
    await w.step(unitAt({ x: 1, facing: 'LEFT' }));
    await w.step(
      unitAt({ x: 3, facing: 'RIGHT' }),
      [
        {
          type: 'displace',
          data: { unitId: 'e', x: 3, y: 0, duration: 0.8, keepFacing: true },
        },
      ],
      0.1,
      2,
    );
    // 0.8 game s at 2× is 0.4 real s; after 0.1 s a decelerating slide has covered 2u − u² = 0.4375 of the way
    expect(defined(w.actor()).position.x).toBeCloseTo(1 + 2 * 0.4375, 6);
    expect(defined(w.actor()).left).toBe(true);
    for (let index = 0; index < 3; index += 1) {
      await w.step(unitAt({ x: 3, facing: 'RIGHT' }), [], 0.1, 2);
    }
    expect(defined(w.actor()).position.x).toBeCloseTo(3, 6);
    expect(defined(w.actor()).slide).toBeNull();
    await w.step(unitAt({ x: 3, facing: 'RIGHT' }), [], 0.1, 2);
    expect(defined(w.actor()).left).toBe(false);
  });

  it('turns with the unit when the displace does not keep the facing, and falls back to 0.14·√D real seconds without a duration', async () => {
    const w = world();
    await w.step(unitAt({ x: 0, facing: 'LEFT' }));
    await w.step(
      unitAt({ x: 4, facing: 'RIGHT' }),
      [
        {
          type: 'displace',
          data: { unitId: 'e', x: 4, y: 0, duration: 0, keepFacing: false },
        },
      ],
      0,
    );
    expect(defined(w.actor()).slide?.seconds).toBeCloseTo(
      Math.min(MISSION_ACTOR_SLIDE.max, MISSION_ACTOR_SLIDE.perRootTile * 2),
      9,
    );
    expect(defined(w.actor()).left).toBe(false);
  });
});

describe('death', () => {
  it('plays the death clip, at most 8 s, before the fade, and a flyer keeps its lift through it', async () => {
    const w = world({ Die: 20 }, { hover: 1.3 });
    await w.step(unitAt());
    await w.step(unitAt());
    expect(defined(w.actor()).root.position.y).toBeCloseTo(1.3, 9);
    await w.step(null, [{ type: 'removed', data: { unitId: 'e' } }]);
    expect(defined(w.actor()).dying).toBeCloseTo(
      MISSION_ACTOR_DIE_SECONDS - 0.1,
      9,
    );
    expect(w.calls()).toContain('play 0 Die');
    await w.step(null, [], 7);
    expect(defined(w.actor()).fade).toBe(1);
    expect(defined(w.actor()).root.position.y).toBeCloseTo(1.3, 9);
    await w.step(null, [], 1);
    await w.step(null, [], 0.3);
    expect(defined(w.actor()).fade).toBeCloseTo(0.5, 6);
    // the lift drops with the fade, the next frame placing the model
    await w.step(null, [], 0);
    expect(defined(w.actor()).root.position.y).toBeCloseTo(0.65, 6);
    await w.step(null, [], 1);
    expect(w.actor()).toBeUndefined();
  });

  it('holds the finished death pose: the skeleton is no longer advanced until the unit stands again', async () => {
    const w = world({ Die: 0.2 });
    await w.step(unitAt());
    await w.step(unitAt({ downed: true }));
    const instance = defined(defined(w.actor()).skeleton.instance);
    await w.step(unitAt({ downed: true }));
    await w.step(unitAt({ downed: true }));
    expect(defined(w.actor()).skeleton.held).toBe(true);
    const elapsed = (instance as unknown as { elapsed: number }).elapsed;
    await w.step(unitAt({ downed: true }));
    expect((instance as unknown as { elapsed: number }).elapsed).toBe(elapsed);
    await w.step(unitAt());
    expect(defined(w.actor()).skeleton.held).toBe(false);
    expect(
      (instance as unknown as { elapsed: number }).elapsed,
    ).toBeGreaterThan(elapsed);
  });
});

describe('late models and attacks', () => {
  it('a model loaded after the deploy continues the entrance, or skips one already over', async () => {
    const w = world({ Start: 1 });
    await w.step(unitAt(), [{ type: 'deploy', data: { unitId: 'e' } }], 0.3);
    expect(w.calls()).toEqual([]);
    await w.step(unitAt(), [], 0.3);
    expect(w.calls()).toContain('play 0 Start @0.30');
    const late = world({ Start: 0.2 });
    await late.step(unitAt(), [{ type: 'deploy', data: { unitId: 'e' } }], 0.3);
    await late.step(unitAt(), [], 0.3);
    expect(late.calls()).not.toContain('play 0 Start');
    expect(late.calls().some((call) => call.startsWith('play 0 Start'))).toBe(
      false,
    );
    expect(late.calls()).toContain('play 0 Idle loop');
  });

  it('an attack takes the place of a pending entrance and plays its whole clip', async () => {
    const w = world({ Start: 1, Attack: 0.5 });
    await w.step(unitAt(), [
      { type: 'deploy', data: { unitId: 'e' } },
      { type: 'attack', data: { unitId: 'e', targetIds: [], cancel: false } },
    ]);
    await w.step(unitAt());
    expect(w.calls().filter((call) => call.startsWith('play'))).toEqual([
      'play 0 Attack',
    ]);
  });
});

describe('turrets', () => {
  it('recoils against the shot and settles at the recoil decay', async () => {
    const w = world();
    const device = unitAt({ kind: 'device', x: 1, y: 0 });
    await w.step(device);
    await w.step(
      device,
      [{ type: 'attack', data: { unitId: 'e', targetIds: [], cancel: false } }],
      0,
    );
    expect(defined(w.actor()).recoil.amount).toBe(1);
    expect(defined(w.actor()).root.position.x).toBeCloseTo(
      1 + (base.facing === 'LEFT' ? 1 : -1) * MISSION_ACTOR_RECOIL.tiles,
      9,
    );
    await w.step(device, [], 1 / MISSION_ACTOR_RECOIL.decay);
    expect(defined(w.actor()).root.position.x).toBeCloseTo(1, 9);
  });
});
