import type {
  BattleEvent,
  BattleEventType,
  CoreEventType,
} from 'arknights-mission-core';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { createActorWorld } from '#actor/entity/index.js';
import type { MissionCue, MissionExtensionEventType } from '#contract/cue.js';
import { createMissionCueBindings, eventBindingOf } from '#effect/binding.js';
import { createEffectLayer } from '#effect/layer.js';
import { createMissionEffectTable } from '#effect/table.js';

declare module 'arknights-mission-core' {
  interface BattleEventMap {
    'test:ping': { readonly unitId: string };
  }
}

function ping(tick: number): BattleEvent<'test:ping'> {
  return { tick, type: 'test:ping', data: { unitId: 'a' } };
}

function layered() {
  const played: MissionCue<'test:ping'>[] = [];
  const unbound: string[] = [];
  const table = createMissionEffectTable();
  table.register<'test:ping', null>({
    id: 'test:ping-ring',
    accepts: ['test:ping'],
    create: () => null,
    start(_ring, cue) {
      played.push(cue);
      return false;
    },
    update: () => false,
    end: () => {},
    dispose: () => {},
  });
  const bindings = createMissionCueBindings();
  return { played, unbound, table, bindings };
}

describe('extension events', () => {
  it('types a merged event as an extension, outside the core table', () => {
    expectTypeOf<MissionExtensionEventType>().toEqualTypeOf<'test:ping'>();
    expectTypeOf<'test:ping'>().toExtend<BattleEventType>();
    expectTypeOf<'test:ping'>().not.toExtend<CoreEventType>();
    expect(eventBindingOf('test:ping')).toBeUndefined();
  });

  it('reports an unbound extension event through onUnboundCue', () => {
    const { played, unbound, table, bindings } = layered();
    const layer = createEffectLayer(createActorWorld(), {
      table,
      bindings,
      onUnboundCue: (key) => void unbound.push(key),
    });
    layer.system.run({
      deltaSeconds: 0.25,
      units: [],
      moving: new Set(),
      events: [ping(1), ping(1)],
    });
    expect(unbound).toEqual(['test:ping']);
    expect(played).toEqual([]);
  });

  it('plays a bound extension event once', () => {
    const { played, unbound, table, bindings } = layered();
    bindings.bind('test:ping', { effect: 'test:ping-ring', sound: null });
    const layer = createEffectLayer(createActorWorld(), {
      table,
      bindings,
      onUnboundCue: (key) => void unbound.push(key),
    });
    layer.system.run({
      deltaSeconds: 0.25,
      units: [],
      moving: new Set(),
      events: [ping(1)],
    });
    expect(unbound).toEqual([]);
    expect(played).toEqual([
      { key: 'test:ping', tick: 1, data: { unitId: 'a' } },
    ]);
  });
});
