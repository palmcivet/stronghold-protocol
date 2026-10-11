import {
  type ContentContext,
  createBattle,
  defineEffect,
  defineTag,
  type MissionModule,
  redeployModule,
} from 'arknights-mission-core';
import { expect, test } from 'vitest';
import { ally, spec } from '#test/fixture.js';

const KEEP = defineTag('case-keep', { meaning: 'kept through down' });
const LOSE = defineTag('case-lose', { meaning: 'dropped on down' });

type Plan = Readonly<Record<number, (ctx: ContentContext) => void>>;

function open(plan: Plan) {
  const removed: string[] = [];
  const module: MissionModule = {
    id: 'case',
    install(ctx) {
      ctx.registerTag(KEEP);
      ctx.registerTag(LOSE);
      ctx.registerEffect(
        defineEffect('case-trait', {
          grantsTags: [KEEP],
          keepOnDown: true,
          onRemove: () => void removed.push('case-trait'),
        }),
      );
      ctx.registerEffect(
        defineEffect('case-buff', {
          grantsTags: [LOSE],
          onRemove: () => void removed.push('case-buff'),
        }),
      );
      ctx.registerSystem({
        id: 'plan',
        slot: 'schedule',
        priority: 0,
        run: (runCtx) => plan[runCtx.tick()]?.(runCtx),
      });
    },
  };
  const battle = createBattle(
    spec({
      modules: ['case', 'redeploy'],
      cost: {
        ally: { initial: 10, regen: 0, cap: 99 },
        enemy: { initial: 0, regen: 0, cap: 0 },
      },
      units: [
        ally('a', {
          attributes: {
            hp: 100,
            maxHp: 100,
            atk: 0,
            def: 0,
            cost: 0,
            respawnTime: 1,
          },
          attackRange: [],
        }),
      ],
    }),
    [module, redeployModule],
  );
  return {
    removed,
    run(count: number) {
      for (let index = 0; index < count; index += 1) {
        battle.step();
      }
    },
    tags: () =>
      battle.snapshot().units.find((unit) => unit.id === 'a')?.tags ?? [],
    downed: () =>
      battle.snapshot().units.find((unit) => unit.id === 'a')?.downed,
  };
}

const both = (ctx: ContentContext) => {
  ctx.applyEffect('a', 'case-trait', { duration: Number.POSITIVE_INFINITY });
  ctx.applyEffect('a', 'case-buff', { duration: Number.POSITIVE_INFINITY });
};

test('友方倒下时取下身上的效果并调用 onRemove，keepOnDown 的留着，再部署后还在', () => {
  const h = open({
    0: both,
    2: (ctx) =>
      ctx.dealDamage({
        sourceId: 'a',
        targetId: 'a',
        amount: 1e9,
        kind: 'true',
      }),
  });
  h.run(2);
  expect(h.tags()).toEqual(expect.arrayContaining([KEEP.id, LOSE.id]));
  h.run(1);
  expect(h.downed()).toBe(true);
  expect(h.tags()).toContain(KEEP.id);
  expect(h.tags()).not.toContain(LOSE.id);
  expect(h.removed).toEqual(['case-buff']);
  h.run(40);
  expect(h.downed()).toBe(false);
  expect(h.tags()).toContain(KEEP.id);
  expect(h.tags()).not.toContain(LOSE.id);
});

test('撤下同样取下不常驻的效果', () => {
  const h = open({ 0: both, 2: (ctx) => void ctx.retreatUnit('a') });
  h.run(3);
  expect(h.downed()).toBe(true);
  expect(h.tags()).toContain(KEEP.id);
  expect(h.tags()).not.toContain(LOSE.id);
  expect(h.removed).toEqual(['case-buff']);
});
