import {
  attackRangeGrid,
  composeStats,
  composeTalents,
  extendedGrid,
  traitRangeExtend,
} from 'arknights-mission-core';
import { expect, test } from 'vitest';

// MARK: compose

test('带模块的属性是无模块属性加模块平加值，保留六位小数；没有的字段按 0 加；整数与 1e6 以上不舍入；不改输入', () => {
  const base = Object.freeze({ atk: 100, def: 50.1, big: 2e6 });
  const attr = Object.freeze({
    atk: 0.1234567,
    def: 0.2,
    hp: 30,
    big: 0.1234567,
  });
  expect(composeStats(base, attr)).toEqual({
    atk: 100.123457,
    def: 50.3,
    hp: 30,
    big: 2000000.1234567,
  });
  expect(base).toEqual({ atk: 100, def: 50.1, big: 2e6 });
  expect(composeStats(base, null)).toEqual(base);
  expect(composeStats(null, { atk: 5 })).toEqual({ atk: 5 });
});

test('天赋按序号覆盖，模块未写的键保留、bb 合并，新序号追加，空占位丢弃；不改输入', () => {
  const base = [
    {
      index: 0,
      name: 'A',
      desc: 'a',
      bb: { x: 1, y: 2 },
      bbStr: { s: '1' },
      rangeGrid: [[0, 1]],
      tokenKey: 't',
      hidden: true,
    },
    { index: 1, name: 'B', bb: {} },
    { index: 3 },
  ];
  const snapshot = structuredClone(base);
  const changes = [
    { talentIndex: 0, desc: 'a2', bb: { y: 3 } },
    { talentIndex: 1 },
    { talentIndex: 2, name: 'C' },
    { talentIndex: -1, rangeGrid: [[0, 0]] },
  ];
  expect(composeTalents(base, changes)).toEqual([
    {
      index: 0,
      name: 'A',
      desc: 'a2',
      bb: { x: 1, y: 3 },
      bbStr: { s: '1' },
      rangeGrid: [[0, 1]],
      tokenKey: 't',
      fromModule: true,
    },
    { index: 1, name: 'B', bb: {}, bbStr: {}, fromModule: true },
    { index: 2, name: 'C', fromModule: true },
  ]);
  expect(base).toEqual(snapshot);
  expect(composeTalents(null, null)).toEqual([]);
});

// MARK: range

const RECORD = [
  [0, 0],
  [0, 1],
];
const SKILL = [
  [0, 0],
  [0, 1],
  [0, 2],
];
const MODULE = [
  [0, 0],
  [0, 1],
  [1, 1],
];

function record(over: Record<string, unknown> = {}) {
  return {
    rangeGrid: RECORD,
    isGolden: true,
    module: { id: 'm1', active: true },
    modules: [
      {
        uniEquipId: 'm1',
        talentChanges: [
          { talentIndex: 0, rangeGrid: [[9, 9]] },
          { talentIndex: -1, rangeGrid: MODULE },
        ],
      },
    ],
    trait: { moduleDesc: '攻击范围扩大' },
    ...over,
  };
}

test('部署范围：技能写明「被动效果：攻击范围扩大」时用技能范围，先于模块', () => {
  expect(
    attackRangeGrid(
      record({ skill: { desc: '被动效果：攻击范围扩大', rangeGrid: SKILL } }),
    ),
  ).toEqual(SKILL);
  expect(
    attackRangeGrid(
      record({ skill: { desc: '攻击力提高', rangeGrid: SKILL } }),
    ),
  ).toEqual(MODULE);
});

test('部署范围：精英且装着写明「攻击范围扩大」的模块时用模块序号 −1 的范围；不是精英、模块未装或没有该范围时用记录范围', () => {
  expect(attackRangeGrid(record())).toEqual(MODULE);
  expect(attackRangeGrid(record({ isGolden: false }))).toEqual(RECORD);
  expect(
    attackRangeGrid(record({ module: { id: 'm1', active: false } })),
  ).toEqual(RECORD);
  expect(
    attackRangeGrid(record({ trait: { moduleDesc: '攻击力提高' } })),
  ).toEqual(RECORD);
  expect(
    attackRangeGrid(
      record({ modules: [{ uniEquipId: 'm1', talentChanges: [] }] }),
    ),
  ).toEqual(RECORD);
});

test('部署范围再加特性的永久攻击距离，向下取整；集成战略专用、非正数不加；null 与无范围得 null', () => {
  const trait = (extend: unknown, moduleDesc = '') => ({
    isGolden: false,
    rangeGrid: RECORD,
    trait: { moduleDesc, bb: { ability_range_forward_extend: extend } },
  });
  expect(traitRangeExtend(trait(1.7))).toBe(1);
  expect(attackRangeGrid(trait(1.7))).toEqual(SKILL);
  expect(traitRangeExtend(trait(1, '在集成战略中攻击距离+1'))).toBe(0);
  expect(attackRangeGrid(trait(1, '在集成战略中攻击距离+1'))).toEqual(RECORD);
  expect(attackRangeGrid(trait(0))).toEqual(RECORD);
  expect(attackRangeGrid(trait(-1))).toEqual(RECORD);
  expect(traitRangeExtend(null)).toBe(0);
  expect(attackRangeGrid(null)).toBeNull();
  expect(attackRangeGrid('grid')).toBeNull();
  expect(
    attackRangeGrid({ trait: { bb: { ability_range_forward_extend: 1 } } }),
  ).toBeNull();
});

// MARK: extend

test('攻击距离 n：每一行在最远端外补 1…⌊n⌋ 格，原格在前；不改输入', () => {
  const grid = [
    [0, 0],
    [0, 1],
    [1, 0],
    [-1, 2],
  ];
  const snapshot = structuredClone(grid);
  expect(extendedGrid(grid, 2)).toEqual([
    ...grid,
    [0, 2],
    [0, 3],
    [1, 1],
    [1, 2],
    [-1, 3],
    [-1, 4],
  ]);
  expect(extendedGrid(grid, 2.9)).toEqual(extendedGrid(grid, 2));
  expect(grid).toEqual(snapshot);
});

test('攻击距离：重复格去重，无效项丢弃；n 不大于 0、NaN、Infinity 不延伸；不是数组得空', () => {
  expect(
    extendedGrid(
      [[0, 0], [0, 0], [0.5, 1], 'x', null, [1], [0, '1'], [2, 3]],
      1,
    ),
  ).toEqual([
    [0, 0],
    [2, 3],
    [0, 1],
    [2, 4],
  ]);
  for (const n of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, undefined]) {
    expect(extendedGrid([[0, 0]], n)).toEqual([[0, 0]]);
  }
  expect(extendedGrid(null, 1)).toEqual([]);
  expect(extendedGrid(undefined, 1)).toEqual([]);
  expect(extendedGrid({}, 1)).toEqual([]);
});

test('攻击距离最多补到场地列数 21 格', () => {
  expect(extendedGrid([[0, 0]], 100)).toEqual(
    Array.from({ length: 22 }, (_, k) => [0, k]),
  );
});
