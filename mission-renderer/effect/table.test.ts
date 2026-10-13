import { describe, expect, it } from 'vitest';
import {
  createMissionEffectTable,
  type MissionEffectKind,
} from '#effect/table.js';

function kind(
  id: `${string}:${string}`,
  mark: string,
): MissionEffectKind<'hit', string> {
  return {
    id,
    accepts: ['hit'],
    create: () => mark,
    start: () => true,
    update: () => false,
    end: () => undefined,
    dispose: () => undefined,
  };
}

describe('effect table', () => {
  it("starts with the engine's kinds and adds kinds under namespaced ids", () => {
    const table = createMissionEffectTable();
    expect(table.ids()).toEqual([
      'mission:hit-flash',
      'mission:heal-flash',
      'mission:deploy-ring',
      'mission:damage-number',
      'mission:hit-spark',
      'mission:projectile',
      'mission:death-dissolve',
      'mission:shatter',
      'mission:muzzle-flash',
      'mission:element-burst',
    ]);
    table.register(kind('my-mod:snow/storm', 'b'));
    expect(table.has('my-mod:snow/storm')).toBe(true);
    expect(() =>
      table.register(kind('spark' as `${string}:${string}`, 'a')),
    ).toThrow(RangeError);
    expect(() => table.register(kind('my-mod:snow/storm', 'c'))).toThrow(
      /twice/,
    );
  });

  it('replaces a registered kind, refuses to replace a missing one, and refuses both once sealed', () => {
    const table = createMissionEffectTable();
    table.replace(kind('mission:hit-flash', 'b'));
    expect(table.get('mission:hit-flash')?.create({} as never)).toBe('b');
    expect(() => table.replace(kind('mission:beam', 'c'))).toThrow(
      /not registered/,
    );
    table.seal();
    expect(() => table.replace(kind('mission:hit-flash', 'd'))).toThrow(
      /sealed/,
    );
    expect(() => table.register(kind('my-mod:beam', 'e'))).toThrow(/sealed/);
  });
});
