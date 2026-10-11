import {
  type ContentContext,
  createBattle,
  type MissionModule,
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

type Plan = Readonly<Record<number, (ctx: ContentContext) => unknown>>;

/** a 带 5 发的弹药技能，第 0 拍开技能；没有攻击计时器，只有内容要求的出手。free 为真时 attack 拦截把 noAmmo 改成 true。 */
function sniper(plan: Plan, free = () => false) {
  const notes: unknown[] = [];
  const used: number[] = [];
  const module: MissionModule = {
    id: 'case',
    install(ctx) {
      ctx.subscribe('ammo-used', (event) => {
        used.push(event.data.left);
      });
      ctx.subscribe('attack', (event) => {
        if (free()) {
          event.data.noAmmo = true;
        }
      });
      ctx.registerSystem({
        id: 'plan',
        slot: 'schedule',
        priority: 0,
        run(runCtx) {
          if (runCtx.tick() === 0) {
            runCtx.castSkill('a', 's');
          }
          const step = plan[runCtx.tick()];
          if (step) {
            notes.push(step(runCtx));
          }
        },
      });
    },
  };
  const battle = createBattle(
    spec({
      modules: ['case'],
      tiles: lane,
      units: [
        ally('a', {
          attributes: { hp: 100, atk: 10, def: 0 },
          attackRange: [
            { x: 1, y: 0 },
            { x: 2, y: 0 },
          ],
          skills: [
            {
              id: 's',
              body: 'ammo',
              trigger: 'NEVER',
              spCost: 5,
              initSp: 5,
              duration: 0,
              ammo: 5,
              spType: 'time',
            },
          ],
        }),
        ally('e', {
          side: 'enemy',
          x: 2,
          attackRange: [],
          attributes: { hp: 1e9, def: 0 },
        }),
      ],
    }),
    [module],
  );
  return {
    notes,
    used,
    run(ticks: number) {
      for (let step = 0; step < ticks; step += 1) {
        battle.step();
      }
      return battle.snapshot().units.find((unit) => unit.id === 'a')?.skills[0];
    },
    hp: () =>
      battle.snapshot().units.find((unit) => unit.id === 'e')?.attributes.hp ??
      Number.NaN,
  };
}

test('forceAttack 额外打一下：noAmmo 时不用弹药、不送 ammo-used；不带时用掉一发；默认按普攻选目标', () => {
  const h = sniper({
    1: (ctx) => ctx.forceAttack('a', ['e'], { noAmmo: true }),
    2: (ctx) => ctx.forceAttack('a'),
  });
  expect(h.run(2)?.ammo).toEqual({ left: 5, max: 5 });
  expect(h.hp()).toBe(1e9 - 10);
  expect(h.used).toEqual([]);
  expect(h.run(1)?.ammo).toEqual({ left: 4, max: 5 });
  expect(h.used).toEqual([4]);
  expect(h.notes).toEqual([true, true]);
});

test('attack 拦截把 noAmmo 改成真时普攻也不用弹药；最后一发用 noAmmo 打不结束技能', () => {
  let free = true;
  const h = sniper(
    {
      1: (ctx) => ctx.forceAttack('a'),
      2: () => {
        free = false;
        return null;
      },
      3: (ctx) => [1, 2, 3, 4].map(() => ctx.forceAttack('a')),
      4: () => {
        free = true;
        return null;
      },
      5: (ctx) => ctx.forceAttack('a'),
    },
    () => free,
  );
  expect(h.run(2)?.ammo).toEqual({ left: 5, max: 5 });
  expect(h.run(2)?.ammo).toEqual({ left: 1, max: 5 });
  const last = h.run(2);
  expect(last?.active).toBe(true);
  expect(last?.ammo).toEqual({ left: 1, max: 5 });
});

test('没有目标、目标已离场或不在场的单位时 forceAttack 返回 false', () => {
  const h = sniper({
    1: (ctx) => ctx.forceAttack('a', ['nobody']),
    2: (ctx) => ctx.forceAttack('nobody'),
  });
  h.run(3);
  expect(h.notes).toEqual([false, false]);
});
