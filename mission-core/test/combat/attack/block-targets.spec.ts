import {
  blockModule,
  createBattle,
  type UnitSpec,
} from 'arknights-mission-core';
import { expect, test } from 'vitest';
import { ally, spec } from '#test/fixture.js';

const tiles = Array.from({ length: 6 }, (_, x) => ({
  x,
  y: 0,
  height: 0,
  deployable: true,
  walkableBy: ['ground'],
}));

/** 阻挡数 blockCnt 的单位站在 (0, 0)，范围是自己这格和前面三格；返回第一次攻击的目标。 */
function firstAttack(
  at: readonly number[],
  blockCnt = 3,
  blockTargets = true,
): { targets: readonly string[]; blocking: readonly string[] } {
  const enemies: UnitSpec[] = at.map((x, index) =>
    ally(`e${index}`, {
      side: 'enemy',
      x,
      y: 0,
      attributes: { hp: 1e9, atk: 0, def: 0, moveSpeed: 0 },
    }),
  );
  const battle = createBattle(
    spec({
      modules: ['block'],
      tiles,
      units: [
        ally('c', {
          attributes: { hp: 1e6, atk: 100, def: 0, blockCnt, bat: 1 },
          timers: ['attack'],
          attackRange: [0, 1, 2, 3].map((x) => ({ x, y: 0 })),
          ...(blockTargets ? { attackShape: { blockTargets: true } } : {}),
        }),
        ...enemies,
      ],
    }),
    [blockModule],
  );
  for (let tick = 0; tick < 90; tick += 1) {
    battle.step();
    const targets = battle
      .drainEvents()
      .flatMap((event) =>
        event.type === 'attack' && event.data.unitId === 'c'
          ? [event.data.targetIds]
          : [],
      )[0];
    if (targets) {
      const blocking =
        battle.snapshot().units.find((unit) => unit.id === 'c')?.blocking ?? [];
      return { targets, blocking };
    }
  }
  throw new Error('no attack');
}

test('阻挡一个、范围里还有两个：一次攻击打三个，阻挡的那个在前', () => {
  const { targets, blocking } = firstAttack([0, 1, 2]);
  expect(blocking).toEqual(['e0']);
  expect(targets).toHaveLength(3);
  expect(targets[0]).toBe('e0');
});

test('没阻挡时从范围里取阻挡数个；不超过阻挡数；阻挡数 0 也打一个；不写 blockTargets 只打一个', () => {
  const free = firstAttack([1, 2, 3]);
  expect(free.blocking).toEqual([]);
  expect(free.targets).toHaveLength(3);
  const crowd = firstAttack([0, 1, 1, 2, 2, 3]);
  expect(crowd.targets).toHaveLength(3);
  expect(crowd.blocking.length).toBeGreaterThan(0);
  for (const id of crowd.blocking) {
    expect(crowd.targets).toContain(id);
  }
  expect(firstAttack([1, 2], 0).targets).toHaveLength(1);
  expect(firstAttack([0, 1, 2], 3, false).targets).toHaveLength(1);
});
