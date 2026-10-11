import {
  type ContentContext,
  createBattle,
  defineEffect,
  type MissionModule,
  type UnitSpec,
} from 'arknights-mission-core';
import { describe, expect, test } from 'vitest';
import { ally, spec } from '#test/fixture.js';

type Plan = Readonly<Record<number, (ctx: ContentContext) => void>>;

/** 按计划在 schedule 槽改动，每拍在 finale 槽读一次属性。 */
function readings(
  units: UnitSpec[],
  plan: Plan,
  steps: number,
  key: string,
  install?: MissionModule['install'],
): number[] {
  const seen: number[] = [];
  const module: MissionModule = {
    id: 'case',
    install(ctx) {
      install?.(ctx);
      ctx.registerSystem({
        id: 'plan',
        slot: 'schedule',
        priority: 1,
        run(runCtx) {
          plan[runCtx.tick()]?.(runCtx);
        },
      });
      ctx.registerSystem({
        id: 'read',
        slot: 'finale',
        priority: 2000,
        run(runCtx) {
          seen.push(runCtx.attribute(units[0]?.id ?? '', key));
        },
      });
    },
  };
  const battle = createBattle(spec({ modules: ['case'], units }), [module]);
  for (let step = 0; step < steps; step += 1) {
    battle.step();
  }
  return seen;
}

/** 读数变化的拍与变化后的值。 */
function changes(seen: readonly number[]): [number, number][] {
  const result: [number, number][] = [];
  seen.forEach((value, tick) => {
    if (tick === 0 || value !== result[result.length - 1]?.[1]) {
      result.push([tick, value]);
    }
  });
  return result;
}

describe('属性读数随修饰来源改变', () => {
  test('限时修饰写上、到期与清掉后，读数随之改变', () => {
    const seen = readings(
      [ally('a', { attributes: { hp: 100, atk: 10, def: 0 } })],
      {
        1: (ctx) =>
          ctx.setModifier(
            'a',
            'buff',
            [{ attribute: 'atk', op: 'add', value: 5 }],
            3 / 30,
          ),
        10: (ctx) =>
          ctx.setModifier('a', 'keep', [
            { attribute: 'atk', op: 'percent', value: 1 },
          ]),
        20: (ctx) => ctx.clearModifier('a', 'keep'),
      },
      30,
      'atk',
    );
    expect(changes(seen)).toEqual([
      [0, 10],
      [1, 15],
      [3, 10],
      [10, 20],
      [20, 10],
    ]);
  });

  test('效果施加、加层、到期，以及最强一次结束后接上较弱的一次，读数随之改变', () => {
    const seen = readings(
      [ally('a', { attributes: { hp: 100, atk: 10, def: 0 } })],
      {
        1: (ctx) => ctx.applyEffect('a', 'pile', { duration: 10 / 30 }),
        2: (ctx) => ctx.applyEffect('a', 'pile', { duration: 10 / 30 }),
        20: (ctx) => {
          ctx.applyEffect('a', 'weaken', { value: 0.5, duration: 5 / 30 });
          ctx.applyEffect('a', 'weaken', { value: 0.2, duration: 15 / 30 });
        },
      },
      40,
      'atk',
      (ctx) =>
        ctx.registerEffect(
          defineEffect('pile', {
            stacking: 'stack',
            stackCap: 3,
            modifiers: [{ attribute: 'atk', op: 'add', value: 1 }],
          }),
        ),
    );
    expect(changes(seen)).toEqual([
      [0, 10],
      [1, 11],
      [2, 12],
      [10, 10],
      [20, 5],
      [24, 8],
      [35, 10],
    ]);
  });

  test('技能修饰随技能开始与结束改变读数', () => {
    const seen = readings(
      [
        ally('a', {
          attributes: { hp: 100, atk: 10, def: 0 },
          skills: [
            {
              id: 's',
              body: 'duration',
              trigger: 'NEVER',
              spCost: 1,
              initSp: 1,
              duration: 10 / 30,
              ammo: 0,
              spType: 'none',
              mods: [{ attribute: 'atk', op: 'mul', value: 3 }],
            },
          ],
        }),
      ],
      { 5: (ctx) => ctx.castSkill('a', 's') },
      30,
      'atk',
    );
    expect(changes(seen)).toEqual([
      [0, 10],
      [5, 30],
      [14, 10],
    ]);
  });
});
