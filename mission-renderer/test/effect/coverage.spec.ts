import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  MissionEventBindings,
  MissionEventCueKey,
} from '#contract/cue.js';
import {
  createMissionCueBindings,
  MISSION_EVENT_BINDINGS,
  sealMissionCues,
} from '#effect/binding.js';
import { createMissionEffectTable } from '#effect/table.js';

describe('cue coverage', () => {
  it('binds every core battle event except the bare cue event', () => {
    expectTypeOf(MISSION_EVENT_BINDINGS).toEqualTypeOf<MissionEventBindings>();
    expectTypeOf<
      keyof MissionEventBindings
    >().toEqualTypeOf<MissionEventCueKey>();
    expect(Object.keys(MISSION_EVENT_BINDINGS)).not.toContain('cue');
  });

  it('refuses a core binding table that leaves an event out', () => {
    const { hit: _hit, ...rest } = MISSION_EVENT_BINDINGS;
    // @ts-expect-error every core event needs a binding
    const partial: MissionEventBindings = rest;
    expect(Object.keys(partial)).not.toContain('hit');
  });

  it('binds core events only to registered kinds that accept them', () => {
    expect(() =>
      sealMissionCues(createMissionEffectTable(), createMissionCueBindings()),
    ).not.toThrow();
  });

  it('refuses at seal time a binding to a missing kind or to a kind that does not accept the key', () => {
    const bindings = createMissionCueBindings();
    bindings.bind('cue:snow-storm', { effect: 'my-mod:storm', sound: null });
    bindings.bind('heal', { effect: 'mission:hit-flash', sound: 'heal' });
    expect(() => sealMissionCues(createMissionEffectTable(), bindings)).toThrow(
      /"heal" draws "mission:hit-flash", which does not accept it; "cue:snow-storm" draws "my-mod:storm", which is not registered/,
    );
  });

  it('refuses at seal time a declared cue kind without a binding, with the other problems', () => {
    const bindings = createMissionCueBindings();
    bindings.declare('snow-storm', 'quiet');
    bindings.bind('cue:quiet', { effect: null, sound: null });
    bindings.bind('heal', { effect: 'mission:hit-flash', sound: 'heal' });
    expect(() => sealMissionCues(createMissionEffectTable(), bindings)).toThrow(
      /cue kind "snow-storm" is declared but "cue:snow-storm" is not bound; "heal" draws "mission:hit-flash", which does not accept it/,
    );
  });
});
