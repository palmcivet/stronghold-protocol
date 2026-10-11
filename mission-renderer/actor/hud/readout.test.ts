import type { SkillSnapshot, UnitSnapshot } from 'arknights-mission-core';
import { describe, expect, it } from 'vitest';
import {
  createMissionHudReaders,
  hudReadoutsOf,
  type MissionHudCount,
} from '#actor/hud/readout.js';

function unitOf(
  side: UnitSnapshot['side'],
  skills: readonly SkillSnapshot[] = [],
  components: Record<string, unknown> = {},
): UnitSnapshot {
  return {
    id: 'u',
    side,
    kind: side === 'enemy' ? 'enemy' : 'operator',
    x: 0,
    y: 0,
    facing: 'RIGHT',
    height: 0,
    attributes: { hp: 10, maxHp: 10 },
    maxHp: 10,
    tags: [],
    attackRange: [],
    deployPositions: [],
    elements: {},
    blocking: [],
    blockedBy: null,
    skills,
    shield: 0,
    downed: false,
    redeploy: null,
    unbalanceUntil: null,
    components,
  };
}

const skill = (ammo: SkillSnapshot['ammo']): SkillSnapshot => ({
  id: 's',
  sp: 0,
  spCost: 10,
  charges: 1,
  active: ammo !== null,
  ammo,
});

describe('hud readouts', () => {
  it('reads the magazine of the running ammo skill, and none for enemies', () => {
    expect(
      hudReadoutsOf(unitOf('ally', [skill({ left: 3, max: 8 })])).magazine,
    ).toEqual({ left: 3, max: 8 });
    expect(hudReadoutsOf(unitOf('ally', [skill(null)])).magazine).toBeNull();
    expect(
      hudReadoutsOf(unitOf('enemy', [skill({ left: 3, max: 8 })])).magazine,
    ).toBeNull();
  });

  it('reads pips and the negative pool through the first reader that has a value, clamped to their range', () => {
    const unit = unitOf('ally', [], {
      'pack:stock': { left: 5, max: 3 },
      'pool:debt': 1.7,
    });
    const readers = createMissionHudReaders();
    readers.register({ id: 'other:stock', readout: 'pips', read: () => null });
    readers.register({
      id: 'pack:stock',
      readout: 'pips',
      read: (u) => u.components['pack:stock'] as MissionHudCount,
    });
    readers.register({
      id: 'pool:debt',
      readout: 'negative',
      read: (u) => u.components['pool:debt'] as number,
    });
    expect(hudReadoutsOf(unit, readers.values())).toEqual({
      magazine: null,
      pips: { left: 3, max: 3 },
      negative: 1,
    });
    expect(hudReadoutsOf(unit)).toEqual({
      magazine: null,
      pips: null,
      negative: 0,
    });
  });

  it('refuses new readers once sealed', () => {
    const readers = createMissionHudReaders();
    readers.seal();
    expect(() =>
      readers.register({ id: 'pool:debt', readout: 'negative', read: () => 0 }),
    ).toThrow(/sealed/);
  });
});
