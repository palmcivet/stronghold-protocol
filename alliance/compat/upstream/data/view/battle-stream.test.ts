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

  it('reads damage, heal, death, leak and spawn events and skips the rest', () => {
    expect(
      streamEventsOf([
        ['spawn', { id: 7, name: 'Slug', side: 'enemy' }],
        ['dmg', 7, 120, 'phys'],
        ['heal', 3, 30],
        ['die', 7, 'killed'],
        ['leak', 8],
        ['atk', 3, 7],
      ]),
    ).toEqual([
      { kind: 'spawn', unit: { id: '7', name: 'Slug', side: 'enemy' } },
      { kind: 'damage', unitId: '7', amount: 120 },
      { kind: 'heal', unitId: '3', amount: 30 },
      { kind: 'death', unitId: '7' },
      { kind: 'leak', unitId: '8' },
    ]);
  });

  it('reads field unit info, naming a unit without a name by its id', () => {
    expect(
      streamFieldUnitsOf({
        units: [{ id: 3, side: 'ally' }, { name: 'x' } as MasterUnitInfo],
      }),
    ).toEqual([{ id: '3', name: '3', side: 'ally' }]);
    expect(streamFieldUnitsOf({})).toEqual([]);
  });
});
