import { type BattleSnapshot, BLOWER } from 'arknights-mission-core';
import { describe, expect, it } from 'vitest';
import { blowerFacings } from '#runtime/stage/index.js';
import { recordDuel } from '#test/actor/fixture.js';
import { defined } from '#test/defined.js';

describe('blower facings', () => {
  it('reads the tile and facing of every blower unit in the snapshot', () => {
    const [first] = recordDuel(0, 1000);
    const snapshot: BattleSnapshot = {
      ...defined(first).snapshot,
      units: defined(first).snapshot.units.map((unit) =>
        unit.id === 'e'
          ? { ...unit, tags: [...unit.tags, BLOWER.id], x: 1.2, y: -0.2 }
          : unit,
      ),
    };
    expect(blowerFacings(snapshot)).toEqual([{ x: 1, y: 0, facing: 'LEFT' }]);
    expect(blowerFacings(defined(first).snapshot)).toEqual([]);
  });
});
