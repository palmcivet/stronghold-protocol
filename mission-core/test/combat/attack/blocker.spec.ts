import {
  createBattle,
  type MissionModule,
  type UnitSpec,
} from 'arknights-mission-core';
import { expect, test } from 'vitest';
import { ally, spec } from '#test/fixture.js';

const tiles = [0, 1, 2, 3].map((x) => ({
  x,
  y: 0,
  height: 0,
  deployable: true,
  walkableBy: ['ground'],
}));

function attacker(
  range: UnitSpec['attackRange'],
  blockedBy?: string,
): UnitSpec {
  return ally('e', {
    side: 'enemy',
    x: 1,
    y: 0,
    facing: 'LEFT',
    attackRange: range,
    attributes: { hp: 1000, atk: 50, def: 0 },
    timers: ['attack'],
    ...(blockedBy ? { blockedBy } : {}),
  });
}

function hitsOn(enemy: UnitSpec, blocking: boolean): string[] {
  const hits: string[] = [];
  const module: MissionModule = {
    id: 'case',
    install(ctx) {
      ctx.subscribe('damaged', (event) => {
        hits.push(String(event.data.targetId));
      });
    },
  };
  const battle = createBattle(
    spec({
      modules: ['case'],
      tiles,
      units: [
        ally('blocker', {
          x: 3,
          y: 0,
          attributes: { hp: 1e5, atk: 0, def: 0 },
          attackRange: [],
          ...(blocking ? { blocking: ['e'] } : {}),
        }),
        ally('medic', {
          x: 0,
          y: 0,
          attributes: { hp: 1e5, atk: 0, def: 0 },
          attackRange: [],
        }),
        enemy,
      ],
    }),
    [module],
  );
  for (let step = 0; step < 120; step += 1) {
    battle.step();
  }
  return [...new Set(hits)];
}

test('没有攻击范围的敌人只打挡住它的单位，没被挡时谁也不打', () => {
  expect(hitsOn(attacker([], 'blocker'), true)).toEqual(['blocker']);
  expect(hitsOn(attacker([]), false)).toEqual([]);
});

test('有攻击范围的敌人打范围里没在阻挡它的单位，挡住它的单位在范围外也照打', () => {
  expect(hitsOn(attacker([{ x: 1, y: 0 }]), false)).toEqual(['medic']);
  expect(hitsOn(attacker([{ x: 1, y: 0 }], 'blocker'), true)).toEqual([
    'blocker',
  ]);
});
