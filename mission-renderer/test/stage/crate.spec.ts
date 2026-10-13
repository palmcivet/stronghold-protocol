import { type BattleSnapshot, BLOWER } from 'arknights-mission-core';
import { describe, expect, it } from 'vitest';
import { deviceTiles, fieldOf } from '#runtime/stage/index.js';
import { recordDuel } from '#test/actor/fixture.js';

describe('device tiles', () => {
  it('reads the rounded tile of every device unit except blowers', () => {
    const [first] = recordDuel(0, 1000);
    if (!first) {
      throw new Error('the duel recorded no sample');
    }
    const { snapshot } = first;
    const as = (id: string, tags: readonly string[]): BattleSnapshot => ({
      ...snapshot,
      units: snapshot.units.map((unit) =>
        unit.id === id
          ? {
              ...unit,
              kind: 'device',
              tags: [...unit.tags, ...tags],
              x: 2.4,
              y: -0.3,
            }
          : unit,
      ),
    });
    expect(deviceTiles(as('e', []))).toEqual([{ x: 2, y: 0 }]);
    expect(deviceTiles(as('e', [BLOWER.id]))).toEqual([]);
    expect(deviceTiles(snapshot)).toEqual([]);
  });
});

describe('field of the effects', () => {
  it('is the camera rectangle, the whole map without a camera, and null without a map', () => {
    const map = { cols: 4, rows: 3, tiles: [] };
    expect(fieldOf(map, null)).toEqual({ x: 0, y: 0, width: 4, height: 3 });
    expect(
      fieldOf(map, { x: 1, y: 1, width: 2, height: 2, margin: 0 }),
    ).toEqual({ x: 1, y: 1, width: 2, height: 2 });
    expect(fieldOf(null, null)).toBeNull();
  });
});
