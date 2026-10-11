import {
  createBattle,
  type MissionModule,
  type UnitSpec,
} from 'arknights-mission-core';
import { expect, test } from 'vitest';
import { ally, spec } from '#test/fixture.js';

const lane = [0, 1, 2, 3].map((x) => ({
  x,
  y: 0,
  height: 0,
  deployable: true,
  walkableBy: ['ground'],
}));

/** 记 id 的命中拍。setup 在第 0 拍的 schedule 槽调用一次。 */
function hitsOf(
  id: string,
  units: UnitSpec[],
  ticks: number,
  setup: MissionModule['install'] = () => {},
): number[] {
  const hits: number[] = [];
  const module: MissionModule = {
    id: 'case',
    install(ctx) {
      setup(ctx);
      ctx.subscribe('attack-hit', (event) => {
        if (event.data.unitId === id) {
          hits.push(event.tick);
        }
      });
    },
  };
  const battle = createBattle(spec({ modules: ['case'], tiles: lane, units }), [
    module,
  ]);
  for (let step = 0; step < ticks; step += 1) {
    battle.step();
  }
  return hits;
}

const gaps = (hits: readonly number[]): number[] =>
  hits.slice(1).map((tick, index) => tick - (hits[index] ?? Number.NaN));

test('攻击间隔 1 秒的干员每 30 拍出手一次，3 秒的远程敌人每 90 拍一次', () => {
  const operator = hitsOf(
    'a',
    [
      ally('a', {
        timers: ['attack'],
        attributes: { hp: 100, atk: 10, def: 0, bat: 1 },
      }),
      ally('e', {
        side: 'enemy',
        x: 1,
        attackRange: [],
        attributes: { hp: 1e9, def: 0 },
      }),
    ],
    121,
  );
  expect(gaps(operator)).toEqual([30, 30, 30, 30]);
  const enemy = hitsOf(
    'e',
    [
      ally('a', { attackRange: [], attributes: { hp: 1e9, atk: 0, def: 0 } }),
      ally('e', {
        side: 'enemy',
        x: 3,
        facing: 'LEFT',
        timers: ['attack'],
        attackRange: [
          { x: 1, y: 0 },
          { x: 2, y: 0 },
          { x: 3, y: 0 },
        ],
        attributes: { hp: 1e9, atk: 10, bat: 3, moveSpeed: 0 },
      }),
    ],
    361,
  );
  expect(gaps(enemy)).toEqual([90, 90, 90, 90]);
});

test('攻速不低于 20：两层 −50 的减速让攻击间隔 1.2 秒的单位每 6 秒出手，不是 12 秒', () => {
  const hits = hitsOf(
    'a',
    [
      ally('a', {
        timers: ['attack'],
        attributes: { hp: 100, atk: 10, def: 0, bat: 1.2 },
      }),
      ally('e', {
        side: 'enemy',
        x: 1,
        attackRange: [],
        attributes: { hp: 1e9, def: 0 },
      }),
    ],
    400,
    (ctx) => {
      ctx.registerSystem({
        id: 'slow',
        slot: 'schedule',
        priority: 0,
        run(runCtx) {
          if (runCtx.tick() !== 0) {
            return;
          }
          runCtx.setModifier('a', 'slow-1', [
            { attribute: 'aspd', op: 'add', value: -50 },
          ]);
          runCtx.setModifier('a', 'slow-2', [
            { attribute: 'aspd', op: 'add', value: -50 },
          ]);
        },
      });
    },
  );
  expect(gaps(hits).slice(0, 2)).toEqual([180, 180]);
});
