import { describe, expect, it } from 'vitest';
import { stageMapOf } from './stage-map.js';

const ROAD = {
  tileKey: 'tile_road',
  height: 'LOW',
  buildable: 'ALL',
  groundPassable: true,
  flyPassable: true,
};
const WALL = {
  tileKey: 'tile_forbidden',
  height: 'HIGH',
  buildable: 'NONE',
  groundPassable: false,
  flyPassable: true,
};
const GOAL = { ...ROAD, tileKey: 'tile_end', buildable: 'NONE' };
const MIRE = {
  ...ROAD,
  tileKey: 'tile_mire',
  special: 'mire',
};

describe('master stage map', () => {
  it('reads one tile per cell, row 0 first, with its glyph and the glyph table', () => {
    expect(
      stageMapOf({ rows: ['r#', 'E'], tiles: { r: ROAD, '#': WALL, E: GOAL } }),
    ).toEqual({
      cols: 2,
      rows: 2,
      tiles: [
        {
          x: 0,
          y: 0,
          glyph: 'r',
          height: 0,
          deployable: true,
          walkableBy: ['ground', 'fly'],
          objective: false,
        },
        {
          x: 1,
          y: 0,
          glyph: '#',
          height: 1,
          deployable: false,
          walkableBy: ['fly'],
          objective: false,
        },
        {
          x: 0,
          y: 1,
          glyph: 'E',
          height: 0,
          deployable: false,
          walkableBy: ['ground', 'fly'],
          objective: true,
        },
        {
          x: 1,
          y: 1,
          glyph: '#',
          height: 1,
          deployable: false,
          walkableBy: ['fly'],
          objective: false,
        },
      ],
      special: {},
      devices: [],
    });
  });

  it('maps tile.terrain or official special onto StageTile.terrain and keeps stage special/devices', () => {
    const map = stageMapOf({
      rows: ['m.'],
      tiles: {
        m: MIRE,
        '.': { ...ROAD, terrain: 'smog' },
      },
      special: { mire: { maxStacks: 10 }, blower: { bb: { a: 1 } } },
      devices: [
        {
          key: 'trap_013_blower',
          alias: 'trap_013_blower#001',
          pos: [0, 1],
          dir: 'DOWN',
          role: 'blower',
          active: true,
          rangeGrid: [
            [0, 0],
            [0, 1],
            [0, 2],
          ],
          skill: { bb: { 'blower_s_character[equal].atk': 0.3 } },
        },
      ],
    });
    expect(map?.tiles.find((tile) => tile.glyph === 'm')?.terrain).toBe('mire');
    expect(map?.tiles.find((tile) => tile.glyph === '.')?.terrain).toBe('smog');
    expect(map?.special).toEqual({
      mire: { maxStacks: 10 },
      blower: { bb: { a: 1 } },
    });
    expect(map?.devices).toEqual([
      {
        key: 'trap_013_blower',
        alias: 'trap_013_blower#001',
        x: 1,
        y: 0,
        facing: 'DOWN',
        role: 'blower',
        active: true,
        attackRange: [
          [0, 0],
          [1, 0],
          [2, 0],
        ],
        script: { 'blower_s_character[equal].atk': 0.3 },
      },
    ]);
  });

  it('gives no board for a record without rows', () => {
    expect(stageMapOf(null)).toBeNull();
    expect(stageMapOf({ rows: [] })).toBeNull();
  });
});
