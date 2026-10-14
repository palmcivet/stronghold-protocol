import { describe, expect, it } from 'vitest';
import {
  type MasterUnitInfo,
  streamEventsOf,
  streamFieldUnitsOf,
  streamSnapshotOf,
} from './battle-stream.js';

describe('master battle stream', () => {
  it('reads unit tuples of a snapshot', () => {
    expect(
      streamSnapshotOf({
        units: [
          [3, 1.5, 2, 40, 100, 0, 10, 0, 1],
          [4, 2, 3, 0, 50, 0, 0, 0, 5],
          ['bad'],
        ],
        killed: 1,
        total: 6,
      }),
    ).toEqual({
      units: [
        { id: '3', x: 1.5, y: 2, hp: 40, maxHp: 100, alive: true },
        { id: '4', x: 2, y: 3, hp: 0, maxHp: 50, alive: false },
      ],
      killed: 1,
      total: 6,
    });
  });

  it('reads damage, heal, death, leak, skill, fx and spawn events and skips the rest', () => {
    expect(
      streamEventsOf([
        ['spawn', { id: 7, name: 'Slug', side: 'enemy' }],
        ['dmg', 7, 120, 'phys'],
        ['dmg', 7, 50, 'arts', 'r'],
        ['heal', 3, 30],
        ['skill', 3, 1],
        ['fx', 'hitCap', 1.5, 2, { id: 7 }],
        ['fx', 'blast', 4, 5, { r: 2 }],
        ['die', 7, 'killed'],
        ['leak', 8],
        ['atk', 3, 7],
      ]),
    ).toEqual([
      {
        kind: 'spawn',
        unit: {
          id: '7',
          name: 'Slug',
          side: 'enemy',
          kind: 'enemy',
          defId: null,
          facing: 'RIGHT',
        },
      },
      { kind: 'damage', unitId: '7', amount: 120, damageKind: 'physical' },
      {
        kind: 'damage',
        unitId: '7',
        amount: 50,
        damageKind: 'arts',
        red: true,
      },
      { kind: 'heal', unitId: '3', amount: 30 },
      { kind: 'skill', unitId: '3', active: true },
      {
        kind: 'fx',
        name: 'hit-cap',
        x: 1.5,
        y: 2,
        data: { id: 7, x: 1.5, y: 2, unitId: '7' },
      },
      {
        kind: 'fx',
        name: 'blast',
        x: 4,
        y: 5,
        data: { r: 2, x: 4, y: 5 },
      },
      { kind: 'death', unitId: '7' },
      { kind: 'leak', unitId: '8' },
    ]);
  });

  it('reads field unit info, naming a unit without a name by its id', () => {
    expect(
      streamFieldUnitsOf({
        units: [
          { id: 3, side: 'ally' },
          { id: 5, side: 'ally', kind: 'device', defId: 'trap_1', dir: 'LEFT' },
          { name: 'x' } as MasterUnitInfo,
        ],
      }),
    ).toEqual([
      {
        id: '3',
        name: '3',
        side: 'ally',
        kind: 'operator',
        defId: null,
        facing: 'RIGHT',
      },
      {
        id: '5',
        name: '5',
        side: 'ally',
        kind: 'device',
        defId: 'trap_1',
        facing: 'LEFT',
      },
    ]);
    expect(streamFieldUnitsOf({})).toEqual([]);
  });
});
