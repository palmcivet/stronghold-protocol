import { describe, expect, it } from 'vitest';
import { combatDefsOf } from '#data/view/combat-def.js';
import { stageMapOf } from '#data/view/stage-map.js';
import { battleSpecOf } from './spec.js';

const ROAD = {
  tileKey: 'tile_road',
  height: 'LOW',
  buildable: 'ALL',
  groundPassable: true,
  flyPassable: true,
};
const GOAL = { ...ROAD, tileKey: 'tile_end', buildable: 'NONE' };
const MIRE = { ...ROAD, tileKey: 'tile_mire', special: 'mire' };

const stage = stageMapOf({
  rows: ['.....', '.....', '.....', '.....', 'EEEEE'],
  tiles: { '.': ROAD, E: GOAL },
});

const defs = combatDefsOf(
  {
    chess_a: {
      chessId: 'chess_a',
      charId: 'char_1',
      profession: 'SNIPER',
      dmgType: 'phys',
      rangeGrid: [[1, 0]],
      stats: { maxHp: 100, atk: 20, def: 0, res: 0, bat: 1, aspd: 100, moveSpeed: 1, blockCnt: 1 },
      skill: {
        skillId: 'sk_a',
        skillType: 'AUTO',
        durationType: 'NONE',
        duration: 0,
        spType: 'INCREASE_WHEN_ATTACK',
        spCost: 5,
        initSp: 0,
        bb: { atk_scale: 1.5 },
        trigger: { rule: 'DEFAULT' },
      },
    },
  },
  {
    enemy_1: {
      key: 'enemy_1',
      stats: {
        maxHp: 50,
        atk: 10,
        def: 0,
        res: 0,
        bat: 1,
        aspd: 100,
        moveSpeed: 1,
        blockCnt: 1,
        rangeRadius: 0,
        motion: 'WALK',
        dmgType: 'phys',
      },
      attackMoves: true,
    },
    enemy_ranged: {
      key: 'enemy_ranged',
      stats: {
        maxHp: 50,
        atk: 10,
        def: 0,
        res: 0,
        bat: 1,
        aspd: 100,
        moveSpeed: 1,
        blockCnt: 1,
        rangeRadius: 1.5,
        motion: 'WALK',
        dmgType: 'phys',
      },
      attackRange: [[1, 0], [2, 0]],
      attackClip: { duration: 1, hit: 0.4 },
    },
  },
);

describe('battleSpecOf', () => {
  it('maps a master start spec onto tiles, operators and timed spawns', () => {
    expect(stage).not.toBeNull();
    const spec = battleSpecOf(
      {
        seed: 7,
        stageId: 's1',
        kind: 'normal',
        players: [
          {
            playerId: 'p1',
            colOffset: 0,
            units: [{ kind: 'chess', chessId: 'chess_a', uid: 1, row: 3, col: 5, dir: 'RIGHT' }],
          },
        ],
        spawns: [{ enemyKey: 'enemy_1', time: 1, row: 0, col: 5, route: 'r0' }],
        routes: { r0: [{ row: 0, col: 5 }, { row: 7, col: 5 }] },
      },
      { defs, stages: { s1: stage! } },
    );
    expect(spec).not.toBeNull();
    expect(spec!.seed).toBe(7);
    expect(spec!.tiles.length).toBeGreaterThan(0);
    expect(spec!.units).toHaveLength(1);
    expect(spec!.units[0]).toMatchObject({ id: 'op:1', x: 5, y: 3, side: 'ally' });
    expect(spec!.units[0]?.skills).toHaveLength(1);
    expect(spec!.units[0]?.skills[0]).toMatchObject({
      id: 'sk_a',
      body: 'instant',
      spType: 'attack',
      operation: 'AUTO',
    });
    expect(spec!.spawns).toHaveLength(1);
    expect(spec!.spawns[0]?.atTick).toBe(30);
    expect(spec!.spawns[0]?.unit.tags).toContain('attack-moves');
    expect(spec!.modules).toContain('official-funnel');
  });

  it('writes tile.terrain, notes.special, and active 风机 as blower devices', () => {
    const board = stageMapOf({
      rows: ['m..', '...', '...'],
      tiles: { m: MIRE, '.': ROAD },
      special: {
        mire: { maxStacks: 10 },
        blower: { bb: { 'blower_s_enemy[equal].move_speed': 0.5 } },
      },
      devices: [
        {
          key: 'trap_013_blower',
          alias: 'trap_013_blower#1',
          pos: [2, 1],
          dir: 'DOWN',
          role: 'blower',
          active: true,
          rangeGrid: [[0, 1], [0, 2]],
          skill: { bb: { 'blower_s_character[equal].atk': 0.3 } },
        },
      ],
    });
    expect(board).not.toBeNull();
    const spec = battleSpecOf(
      { seed: 1, stageId: 'fan', kind: 'normal', players: [], spawns: [] },
      { defs, stages: { fan: board! } },
    );
    expect(spec!.tiles.find((tile) => tile.x === 0 && tile.y === 0)?.terrain).toBe(
      'mire',
    );
    expect(spec!.notes).toMatchObject({
      stageId: 'fan',
      special: {
        mire: { maxStacks: 10 },
        blower: { bb: { 'blower_s_enemy[equal].move_speed': 0.5 } },
      },
    });
    const fan = spec!.units.find((unit) => unit.kind === 'device');
    expect(fan).toMatchObject({
      id: 'device:trap_013_blower#1',
      kind: 'device',
      tags: ['blower'],
      x: 1,
      y: 2,
      facing: 'DOWN',
      attackRange: [
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ],
      script: { 'blower_s_character[equal].atk': 0.3 },
    });
  });

  it('prefers normalized attackRange / attackClip on enemies', () => {
    const spec = battleSpecOf(
      {
        seed: 1,
        stageId: 's1',
        players: [],
        spawns: [{ enemyKey: 'enemy_ranged', time: 0, row: 0, col: 0 }],
      },
      { defs, stages: { s1: stage! } },
    );
    expect(spec!.spawns[0]?.unit.attackRange).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]);
    expect(spec!.spawns[0]?.unit.attackClip).toEqual({ duration: 1, hit: 0.4 });
  });

  it('returns null without a known stage', () => {
    expect(battleSpecOf({ seed: 1, stageId: 'missing' }, { defs, stages: {} })).toBeNull();
  });
});
