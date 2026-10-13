import {
  type BattleEvent,
  type ContentContext,
  createBattle,
  type DamageInfo,
  type MissionModule,
  type UnitSpec,
} from 'arknights-mission-core';
import { expect, test } from 'vitest';
import { redMark } from '#combat/damage/index.js';
import { HIT_COUNT, INVULNERABLE, SLEEP } from '#port/tag.js';
import { ally, spec } from '#test/fixture.js';

/** 第 0 拍对目标 t 打出 hits 里的每一击，返回这一拍的伤害与闪避事件。 */
function strike(
  target: Partial<UnitSpec>,
  hits: readonly Omit<DamageInfo, 'targetId'>[],
  source: Partial<UnitSpec> = {},
  prepare?: (ctx: Parameters<MissionModule['install']>[0]) => void,
): BattleEvent<'damaged' | 'dodged'>[] {
  const module: MissionModule = {
    id: 'case',
    install(ctx) {
      prepare?.(ctx);
      ctx.registerSystem({
        id: 'case',
        slot: 'schedule',
        priority: 1,
        run(runCtx: ContentContext) {
          if (runCtx.tick() !== 0) {
            return;
          }
          for (const hit of hits) {
            runCtx.dealDamage({ ...hit, targetId: 't' });
          }
        },
      });
    },
  };
  const battle = createBattle(
    spec({
      modules: ['case'],
      units: [
        ally('a', { attributes: { hp: 100, atk: 10, def: 0 }, ...source }),
        ally('t', {
          attributes: { hp: 100000, def: 400, res: 0 },
          ...target,
        }),
      ],
    }),
    [module],
  );
  battle.step();
  return battle
    .drainEvents()
    .filter(
      (event): event is BattleEvent<'damaged' | 'dodged'> =>
        event.type === 'damaged' || event.type === 'dodged',
    );
}

const red = (events: readonly BattleEvent[]): (boolean | undefined)[] =>
  events.map((event) =>
    event.type === 'damaged' ? event.data.red : undefined,
  );

test('官方红字的判定是最终伤害不小于期望伤害的 1.5 倍，0 对 0 也是红字', () => {
  expect(redMark(150, 100)).toBe(true);
  expect(redMark(149.9, 100)).toBe(false);
  expect(redMark(0, 0)).toBe(true);
  expect(redMark(Number.NaN, 10)).toBe(false);
});

test('红字比的是护盾前的最终伤害与不计穿透、不计减免后倍率的期望伤害', () => {
  const hit = (amount: number, change: Partial<DamageInfo> = {}) => ({
    sourceId: '',
    sourceless: true,
    amount,
    kind: 'true',
    ...change,
  });
  expect(red(strike({}, [hit(100)]))).toEqual([undefined]);
  const mild = strike(
    { attributes: { hp: 100000, def: 400, res: 0, dmgTaken: 1.2 } },
    [hit(100)],
  );
  expect(
    mild.map((event) => event.type === 'damaged' && event.data.applied),
  ).toEqual([120]);
  expect(red(mild)).toEqual([undefined]);
  expect(
    red(
      strike({ attributes: { hp: 100000, def: 400, res: 0, dmgTaken: 1.5 } }, [
        hit(100),
      ]),
    ),
  ).toEqual([true]);
  const dealt = strike({}, [{ sourceId: 'a', amount: 100, kind: 'true' }], {
    attributes: { hp: 100, atk: 10, def: 0, dmgDealt: 2 },
  });
  expect(
    dealt.map((event) => event.type === 'damaged' && event.data.applied),
  ).toEqual([200]);
  expect(red(dealt)).toEqual([true]);
  expect(red(strike({}, [hit(100, { mul: 2 })]))).toEqual([undefined]);
  const pierced = strike({}, [
    hit(1000, { kind: 'physical', defIgnorePct: 1 }),
    hit(1000, { kind: 'physical' }),
  ]);
  expect(
    pierced.map((event) => event.type === 'damaged' && event.data.applied),
  ).toEqual([1000, 600]);
  expect(red(pierced)).toEqual([true, undefined]);
});

test('护盾、计次、改写不另发事件；计次的 1 不算红字，改写之前的数额决定红字', () => {
  const husk = strike({ tags: [HIT_COUNT.id] }, [
    { sourceId: '', sourceless: true, amount: 1000, kind: 'true' },
  ]);
  expect(husk).toHaveLength(1);
  expect(husk[0]?.type === 'damaged' && husk[0].data.applied).toBe(1);
  expect(red(husk)).toEqual([undefined]);
  const cut = strike(
    { attributes: { hp: 100000, def: 400, res: 0, dmgTaken: 2 } },
    [{ sourceId: '', sourceless: true, amount: 100, kind: 'true' }],
    {},
    (ctx) => {
      ctx.registerDamageModifier({
        id: 'cut',
        stage: 'hp',
        priority: 0,
        modify(change) {
          change.amount = 1;
        },
      });
    },
  );
  expect(cut).toHaveLength(1);
  expect(cut[0]?.type === 'damaged' && cut[0].data.applied).toBe(1);
  expect(red(cut)).toEqual([true]);
  const element = strike({}, [
    {
      sourceId: '',
      sourceless: true,
      amount: 80,
      kind: 'element',
      element: 'burn',
    },
  ]);
  expect(
    element.every(
      (event) => event.type !== 'damaged' || event.data.red === undefined,
    ),
  ).toBe(true);
});

test('无敌与沉睡挡下的一击不发事件；闪避只在本该是红字时标 MISS', () => {
  const hit = { sourceId: '', sourceless: true, amount: 500, kind: 'true' };
  expect(strike({ tags: [INVULNERABLE.id] }, [hit])).toEqual([]);
  expect(strike({ tags: [SLEEP.id] }, [hit])).toEqual([]);
  const dodges = strike(
    { attributes: { hp: 100000, def: 400, res: 0, dodgePhys: 1 } },
    [
      { sourceId: 'a', amount: 1000, kind: 'physical', defIgnorePct: 1 },
      { sourceId: 'a', amount: 100, kind: 'physical' },
    ],
  );
  expect(dodges.map((event) => event.type)).toEqual(['dodged', 'dodged']);
  expect(dodges.map((event) => event.data)).toEqual([
    { sourceId: 'a', targetId: 't', kind: 'physical', miss: true },
    { sourceId: 'a', targetId: 't', kind: 'physical' },
  ]);
});
