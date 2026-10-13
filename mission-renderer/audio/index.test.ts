import type { AssetKey } from 'arknights-assets-catalog';
import type { BattleEvent, UnitSnapshot } from 'arknights-mission-core';
import { describe, expect, it } from 'vitest';
import { audioCueFor, createSkillCueHold, effectCueFor } from '#audio/index.js';
import { createMissionCueBindings } from '#effect/binding.js';

const asset: AssetKey = 'audio:sfx/battle/b_hit';

/** 只带部分字段的事件：audioCueFor 与 effectCueFor 按字段是否存在读取。 */
function event(
  type: string,
  data: Readonly<Record<string, unknown>> = {},
): BattleEvent {
  return { tick: 1, type, data } as BattleEvent;
}

function unitOf(id: string, kind: UnitSnapshot['kind']): UnitSnapshot {
  return {
    id,
    side: 'ally',
    kind,
    x: 0,
    y: 0,
    facing: 'RIGHT',
    height: 0,
    attributes: { hp: 0, maxHp: 1 },
    maxHp: 1,
    tags: [],
    attackRange: [],
    deployPositions: [],
    elements: {},
    blocking: [],
    blockedBy: null,
    skills: [],
    shield: 0,
    downed: true,
    redeploy: null,
    unbalanceUntil: null,
    components: {},
  };
}

describe('audio cues', () => {
  it('maps battle events to cues and ignores events without a sound', () => {
    expect(
      audioCueFor(event('damaged', { unitId: 'guard', amount: 12 })),
    ).toEqual({
      type: 'damage',
      eventType: 'damaged',
      unitId: 'guard',
    });
    expect(audioCueFor(event('element-hit'))?.type).toBe('element');
    expect(audioCueFor(event('status'))?.type).toBe('status');
    expect(audioCueFor(event('projectile'))?.type).toBe('projectile');
    expect(audioCueFor(event('leak'))?.type).toBe('leak');
    expect(audioCueFor(event('trace'))).toBeNull();
  });

  it('plays a break cue when a stage device goes down and a downed cue for an operator', () => {
    const down = event('downed', { unitId: 'crate-1' });

    expect(effectCueFor(down, [unitOf('crate-1', 'device')])?.type).toBe(
      'break',
    );
    expect(effectCueFor(down, [unitOf('guard', 'operator')])?.type).toBe(
      'downed',
    );
    expect(effectCueFor(down, [])?.type).toBe('downed');
  });

  it('attaches the caller asset key to an audio cue', () => {
    expect(
      audioCueFor(
        event('damaged', { unitId: 'guard', targetId: 'enemy', amount: 12 }),
        { audioFor: () => asset },
      ),
    ).toEqual({
      type: 'damage',
      eventType: 'damaged',
      unitId: 'guard',
      targetId: 'enemy',
      asset,
    });
    expect(
      audioCueFor(event('damaged', { amount: 12 }), { audioFor: () => null }),
    ).toEqual({
      type: 'damage',
      eventType: 'damaged',
    });
  });
});

describe('cue kind sounds', () => {
  it('plays the sound bound to a cue kind and stays silent for unbound kinds', () => {
    const bindings = createMissionCueBindings();
    bindings.bind('cue:storm', { effect: null, sound: 'hit' });
    expect(
      audioCueFor(event('cue', { kind: 'storm', unitId: 'caster' }), {
        bindings,
      }),
    ).toEqual({
      type: 'hit',
      eventType: 'cue',
      kind: 'storm',
      unitId: 'caster',
    });
    expect(
      audioCueFor(event('cue', { kind: 'quiet' }), { bindings }),
    ).toBeNull();
    expect(audioCueFor(event('cue', { kind: 'storm' }))).toBeNull();
  });
});

describe('skill slot', () => {
  it('carries the skill slot of attack-hit and hit, and leaves it out otherwise', () => {
    expect(
      audioCueFor(event('attack-hit', { unitId: 'a', skillSlot: 2 })),
    ).toEqual({
      type: 'hit',
      eventType: 'attack-hit',
      unitId: 'a',
      skillSlot: 2,
    });
    expect(
      audioCueFor(event('hit', { targetId: 'e', skillSlot: 0 }))?.skillSlot,
    ).toBe(0);
    expect(
      audioCueFor(event('attack-hit', { unitId: 'a' })),
    ).not.toHaveProperty('skillSlot');
  });
});

describe('early skill cue', () => {
  const skill = (unitId: string) =>
    audioCueFor(event('skill-start', { unitId }));

  it('holds a cast of an unknown unit and plays it once when the unit appears', () => {
    const hold = createSkillCueHold();
    const cast = skill('late');
    expect(cast?.type).toBe('skill');
    if (!cast) {
      return;
    }
    expect(hold.pass(cast, () => false)).toBeNull();
    expect(hold.release(() => false)).toEqual([]);
    expect(hold.release((id) => id === 'late')).toEqual([cast]);
    expect(hold.release(() => true)).toEqual([]);
    expect(hold.pass(cast, () => true)).toBe(cast);
  });

  it('passes other cues, keeps one cast per unit, stays bounded and drops holds on clear', () => {
    const hold = createSkillCueHold(2);
    const hit = audioCueFor(event('hit', { targetId: 'x' }));
    if (!hit) {
      throw new Error('no hit cue');
    }
    expect(hold.pass(hit, () => false)).toBe(hit);
    for (const id of ['a', 'a', 'b', 'c']) {
      const cue = skill(id);
      if (cue) {
        hold.pass(cue, () => false);
      }
    }
    expect(hold.size).toBe(2);
    expect(hold.release(() => true).map((cue) => cue.unitId)).toEqual([
      'b',
      'c',
    ]);
    const cue = skill('d');
    if (cue) {
      hold.pass(cue, () => false);
    }
    hold.clear();
    expect(hold.release(() => true)).toEqual([]);
  });
});
