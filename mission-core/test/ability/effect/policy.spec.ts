import {
  type ContentContext,
  createBattle,
  defineEffect,
  type MissionModule,
} from 'arknights-mission-core';
import { expect, test } from 'vitest';
import { ally, spec } from '#test/fixture.js';

type Plan = Readonly<Record<number, (ctx: ContentContext) => void>>;

/** 每种策略一个加攻击力的效果；读 a 的 atk。 */
function open(plan: Plan) {
  const reads: number[] = [];
  const module: MissionModule = {
    id: 'case',
    install(ctx) {
      const add = [{ attribute: 'atk', op: 'add', value: 1 }] as const;
      ctx.registerEffect(
        defineEffect('case-ind', {
          stacking: 'independent',
          stackCap: 3,
          modifiers: [...add],
        }),
      );
      ctx.registerEffect(
        defineEffect('case-ind-one', {
          stacking: 'independent',
          modifiers: [...add],
        }),
      );
      ctx.registerEffect(
        defineEffect('case-keep', {
          stacking: 'keep',
          scale: (value) => [{ attribute: 'atk', op: 'add', value }],
        }),
      );
      ctx.registerSystem({
        id: 'plan',
        slot: 'schedule',
        priority: 0,
        run: (runCtx) => {
          plan[runCtx.tick()]?.(runCtx);
          reads.push(runCtx.attribute('a', 'atk'));
        },
      });
    },
  };
  const battle = createBattle(
    spec({
      modules: ['case'],
      units: [
        ally('a', { attributes: { hp: 100, atk: 0, def: 0 }, attackRange: [] }),
      ],
    }),
    [module],
  );
  return {
    reads,
    run(count: number) {
      for (let index = 0; index < count; index += 1) {
        battle.step();
      }
    },
  };
}

test('independent：各算各的时长，最多 stackCap 条，满了先去掉最早的（1、2、3、4 秒的四次只留后三次）；缺省上限 1', () => {
  const h = open({
    0: (ctx) => {
      for (let index = 0; index < 4; index += 1) {
        ctx.applyEffect('a', 'case-ind', { duration: 1 + index });
      }
    },
  });
  h.run(1);
  expect(h.reads[0]).toBe(3);
  h.run(130);
  expect(h.reads[50]).toBe(3);
  expect(h.reads[70]).toBe(2);
  expect(h.reads[100]).toBe(1);
  expect(h.reads[125]).toBe(0);
  const one = open({
    0: (ctx) => {
      [1, 2].forEach((seconds) => {
        ctx.applyEffect('a', 'case-ind-one', { duration: seconds });
      });
    },
  });
  one.run(61);
  expect(one.reads[0]).toBe(1);
  expect(one.reads[45]).toBe(1);
  expect(one.reads[60]).toBe(0);
});

test('keep：已经在身上时再施加不生效，强度与时长都留原来的', () => {
  const h = open({
    0: (ctx) => ctx.applyEffect('a', 'case-keep', { duration: 1, value: 5 }),
    10: (ctx) => ctx.applyEffect('a', 'case-keep', { duration: 9, value: 50 }),
  });
  h.run(40);
  expect(h.reads[0]).toBe(5);
  expect(h.reads[20]).toBe(5);
  expect(h.reads[35]).toBe(0);
});
