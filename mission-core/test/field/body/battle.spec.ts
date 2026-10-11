import {
  type BattleEvent,
  createBattle,
  type UnitSpec,
} from 'arknights-mission-core';
import { expect, test } from 'vitest';
import { ally, spec } from '#test/fixture.js';

const tiles = Array.from({ length: 7 }, (_, y) =>
  Array.from({ length: 16 }, (_, x) => ({
    x,
    y,
    height: 0,
    deployable: true,
    walkableBy: ['ground'],
  })),
).flat();
const HUGE = { w: 4.95, h: 2.95, dx: 0, dy: 1 };

function hits(units: UnitSpec[], ticks = 150): Map<string, Set<string>> {
  const battle = createBattle(spec({ tiles, units }), []);
  const seen = new Map<string, Set<string>>();
  for (let tick = 0; tick < ticks; tick += 1) {
    battle.step();
    for (const event of battle.drainEvents() as BattleEvent[]) {
      if (event.type !== 'damaged') {
        continue;
      }
      const set = seen.get(event.data.sourceId) ?? new Set<string>();
      set.add(event.data.targetId);
      seen.set(event.data.sourceId, set);
    }
  }
  return seen;
}

const enemy = (
  id: string,
  x: number,
  y: number,
  patch: Partial<UnitSpec> = {},
) =>
  ally(id, {
    side: 'enemy',
    x,
    y,
    facing: 'LEFT',
    attackRange: [],
    attributes: { hp: 1e9, def: 0 },
    ...patch,
  });
const blade = (
  id: string,
  x: number,
  y: number,
  range: readonly { x: number; y: number }[],
  patch: Partial<UnitSpec> = {},
) =>
  ally(id, {
    x,
    y,
    timers: ['attack'],
    attackRange: [...range],
    attributes: { hp: 1e9, atk: 100, def: 0, bat: 1 },
    ...patch,
  });

test('#10 攻击范围只碰到巨型敌人受击矩形的边也打得到；同一位置的普通敌人打不到', () => {
  // 巨型敌人站在 (10,3)，矩形上移 1 格：占 x 8–12、y 3–5；(7,4) 朝右的近战盖住 (7,4)、(8,4)
  const range = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
  ];
  expect(
    hits([
      blade('u', 7, 4, range),
      enemy('boss', 10, 3, { hitArea: HUGE }),
    ]).get('u'),
  ).toEqual(new Set(['boss']));
  expect(
    hits([blade('u', 7, 4, range), enemy('small', 10, 3)]).get('u'),
  ).toBeUndefined();
});

test('#10 受击矩形的每一格都算，外面一格不算', () => {
  const one = [{ x: 0, y: 0 }];
  const cases: [number, number, boolean][] = [
    [12, 5, true],
    [8, 3, true],
    [8, 5, true],
    [13, 4, false],
    [9, 2, false],
  ];
  for (const [x, y, want] of cases) {
    const got = hits(
      [blade('u', x, y, one), enemy('boss', 10, 3, { hitArea: HUGE })],
      60,
    ).get('u');
    expect(got?.has('boss') ?? false, `(${x},${y})`).toBe(want);
  }
});

test('#10 打护卫的溅射按中点判定：巨型敌人矩形离得近但中心远就不波及，1 格外的普通敌人波及', () => {
  // 护卫在 (9,2)：在矩形下方 0.525，离巨型敌人中心 (10,3) 1.41；溅射半径 1.1
  const caster = blade('c', 6, 2, [{ x: 3, y: 0 }], {
    attackShape: { splash: { radius: 1.1 } },
  });
  const got = hits([
    caster,
    enemy('boss', 10, 3, { hitArea: HUGE }),
    enemy('escort', 9, 2),
    enemy('near', 10, 2),
  ]).get('c');
  expect(got).toEqual(new Set(['escort', 'near']));
});
