import {
  type BattleEvent,
  BOSS,
  type SkillSnapshot,
  TICK,
  type UnitSnapshot,
} from 'arknights-mission-core';
import { describe, expect, it } from 'vitest';
import {
  type ActorFrame,
  createActorWorld,
  MISSION_ACTOR_SHAKE,
} from '#actor/entity/index.js';
import {
  createHudLayer,
  MISSION_HUD_SHAKE,
  MISSION_HUD_SP,
} from '#actor/hud/index.js';
import { recordDuel } from '#test/actor/fixture.js';

const units = recordDuel(0, 1000)[0]?.snapshot.units ?? [];
const unitOf = (id: string): UnitSnapshot => {
  const unit = units.find((item) => item.id === id);
  if (!unit) {
    throw new Error(`unit ${id} missing from the recorded duel`);
  }
  return unit;
};

const skill = (change: Partial<SkillSnapshot>): SkillSnapshot => ({
  id: 'skill',
  sp: 0,
  spCost: 10,
  charges: 1,
  active: false,
  ammo: null,
  ...change,
});

const frame = (
  units: readonly UnitSnapshot[],
  deltaSeconds: number,
  events: readonly BattleEvent[] = [],
): ActorFrame => ({ deltaSeconds, units, moving: new Set(), events });

/** A world and its bars, run frame by frame without the feed. */
function rig() {
  const world = createActorWorld();
  const hud = createHudLayer(world);
  const run = (next: ActorFrame) => {
    for (const system of world.systems) {
      system.run(next);
    }
    hud.system.run(next);
  };
  return { world, hud, run };
}

describe('hud skill bar', () => {
  it('fills by SP, turns ready at full with a pulsing glow, and active while the skill runs', () => {
    const { hud, run } = rig();
    const ally = unitOf('g');
    run(frame([{ ...ally, skills: [skill({ sp: 4 })] }], TICK));
    expect(hud.sp('g')).toEqual({ ratio: 0.4, state: 'charging', glow: 0 });
    run(frame([{ ...ally, skills: [skill({ sp: 10 })] }], 0.25));
    const { pulse } = MISSION_HUD_SP;
    const clock = TICK + 0.25;
    expect(hud.sp('g')?.state).toBe('ready');
    expect(hud.sp('g')?.glow).toBeCloseTo(
      pulse.base + pulse.swing * Math.sin(clock * pulse.speed),
      12,
    );
    run(frame([{ ...ally, skills: [skill({ sp: 6, active: true })] }], TICK));
    expect(hud.sp('g')).toEqual({ ratio: 0.6, state: 'active', glow: 0 });
  });

  it('shows no skill bar for enemies, free skills, or while a magazine takes its place', () => {
    const { hud, run } = rig();
    run(
      frame(
        [
          { ...unitOf('e'), skills: [skill({ sp: 5 })] },
          { ...unitOf('g'), skills: [skill({ spCost: 0 })] },
        ],
        TICK,
      ),
    );
    expect(hud.sp('e')).toBeNull();
    expect(hud.sp('g')).toBeNull();
    run(
      frame(
        [
          {
            ...unitOf('g'),
            skills: [skill({ active: true, ammo: { left: 2, max: 4 } })],
          },
        ],
        TICK,
      ),
    );
    expect(hud.sp('g')).toBeNull();
    expect(hud.readouts('g')?.magazine).toEqual({ left: 2, max: 4 });
  });
});

describe('hit shake', () => {
  it('shakes a boss bar for a quarter second after a health loss, and nobody else', () => {
    const { hud, run } = rig();
    const boss = { ...unitOf('e'), tags: [BOSS.id] };
    const hp = boss.attributes.hp ?? 0;
    const hit = (value: number) => ({
      ...boss,
      attributes: { ...boss.attributes, hp: value },
    });
    run(frame([boss, unitOf('g')], TICK));
    expect(hud.shake('e')).toBe(0);
    run(frame([hit(hp - 100), unitOf('g')], 0.05));
    const clock = TICK + 0.05;
    expect(hud.shake('e')).toBeCloseTo(
      Math.sin(clock * MISSION_HUD_SHAKE.speed) *
        0.25 *
        MISSION_HUD_SHAKE.amplitude,
      12,
    );
    expect(hud.shake('g')).toBe(0);
    run(frame([hit(hp - 100), unitOf('g')], 0.3));
    expect(hud.shake('e')).toBe(0);
  });

  it('sways a damaged device along the columns, decaying over 0.2 s', () => {
    const { world, run } = rig();
    const device: UnitSnapshot = { ...unitOf('g'), id: 'box', kind: 'device' };
    const damaged = {
      tick: 1,
      type: 'damaged',
      data: {
        sourceId: 'e',
        creditId: 'e',
        targetId: 'box',
        amount: 10,
        applied: 10,
        kind: 'physical',
        hp: 90,
        sourceless: false,
      },
    } as const satisfies BattleEvent;
    run(frame([device, unitOf('e')], TICK));
    expect(world.actors.get('box')?.root.position.x).toBe(device.x);
    run(frame([device, unitOf('e')], 0.01, [damaged]));
    const clock = TICK + 0.01;
    expect(world.actors.get('box')?.root.position.x).toBeCloseTo(
      device.x +
        Math.sin(clock * MISSION_ACTOR_SHAKE.speed) *
          MISSION_ACTOR_SHAKE.seconds *
          MISSION_ACTOR_SHAKE.amplitude,
      12,
    );
    run(
      frame([unitOf('g'), unitOf('e')], TICK, [
        { ...damaged, data: { ...damaged.data, targetId: 'g' } },
      ]),
    );
    expect(world.actors.get('g')?.shake).toBe(0);
    run(frame([device, unitOf('e')], 0.25));
    expect(world.actors.get('box')?.shake).toBe(0);
    run(frame([device, unitOf('e')], 0.25));
    expect(world.actors.get('box')?.root.position.x).toBe(device.x);
  });
});
