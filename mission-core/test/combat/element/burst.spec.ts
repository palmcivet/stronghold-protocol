import {
  BURST_LOCK,
  type ContentContext,
  createBattle,
  type MissionModule,
  NO_SP,
  SILENCE,
  STUN,
  type UnitSpec,
} from 'arknights-mission-core';
import { expect, test } from 'vitest';
import { ELEMENT } from '#combat/damage/constants.js';
import { ally, spec } from '#test/fixture.js';

type Plan = Readonly<Record<number, (ctx: ContentContext) => void>>;

interface Reading {
  readonly hp: number;
  readonly atk: number;
  readonly def: number;
  readonly sp: number;
  readonly gauge: Readonly<Record<string, number>>;
  readonly tags: readonly string[];
}

/** plan 在 schedule 槽按拍调用；每拍末尾记下 id 的生命、汇总后的攻击与防御、技力、元素槽与标签。 */
function open(units: UnitSpec[], id: string, plan: Plan) {
  const reads: Reading[] = [];
  const summed: { atk: number; def: number }[] = [];
  const module: MissionModule = {
    id: 'case',
    install(ctx) {
      ctx.registerSystem({
        id: 'plan',
        slot: 'schedule',
        priority: 1,
        run: (runCtx) => plan[runCtx.tick()]?.(runCtx),
      });
      ctx.registerSystem({
        id: 'read',
        slot: 'finale',
        priority: 0,
        run: (runCtx) =>
          void summed.push({
            atk: runCtx.attribute(id, 'atk'),
            def: runCtx.attribute(id, 'def'),
          }),
      });
    },
  };
  const battle = createBattle(spec({ modules: ['case'], units }), [module]);
  return {
    reads,
    run(count: number) {
      for (let index = 0; index < count; index += 1) {
        battle.step();
        const unit = battle.snapshot().units.find((item) => item.id === id);
        if (!unit) {
          throw new Error(`no ${id}`);
        }
        reads.push({
          hp: unit.attributes.hp ?? 0,
          atk: summed[summed.length - 1]?.atk ?? Number.NaN,
          def: summed[summed.length - 1]?.def ?? Number.NaN,
          sp: unit.skills[0]?.sp ?? 0,
          gauge: unit.elements,
          tags: unit.tags,
        });
      }
    },
    at(tick: number): Reading {
      const read = reads[tick];
      if (!read) {
        throw new Error(`no reading at ${tick}`);
      }
      return read;
    },
  };
}

const hit =
  (target: string, element: string, amount = 1000) =>
  (ctx: ContentContext) =>
    ctx.dealDamage({
      sourceId: target,
      targetId: target,
      amount,
      kind: 'element',
      element,
    });

const enemy = ally('e', {
  side: 'enemy',
  attackRange: [],
  attributes: { hp: 1e6, atk: 1000, def: 500, res: 0 },
});

test('敌人凋亡：每秒 800 元素伤害，攻击力减半并随时间恢复，15 秒后恢复原值', () => {
  const h = open([enemy], 'e', { 0: hit('e', 'apoptosis') });
  h.run(30 * 16);
  const start = h.at(0);
  expect(start.atk).toBeCloseTo(500, 6);
  expect(start.hp - h.at(150).hp).toBeCloseTo(
    5 * ELEMENT.apoptosis.enemy.elemDps,
    6,
  );
  expect(h.at(150).atk).toBeGreaterThan(500);
  expect(h.at(150).atk).toBeLessThan(1000);
  expect(h.at(30 * 15 + 5).atk).toBeCloseTo(1000, 6);
});

test('敌人侵蚀：5000 元素伤害并永久降防 120，可叠；爆发后槽锁 8 秒，到时归零', () => {
  const h = open([enemy], 'e', {
    0: hit('e', 'erosion'),
    [30 * 8 + 5]: hit('e', 'erosion'),
  });
  h.run(30 * 8 + 10);
  expect(1e6 - h.at(0).hp).toBe(ELEMENT.erosion.enemy.elemDamage);
  expect(h.at(0).def).toBe(500 - ELEMENT.erosion.enemy.defDown);
  expect(h.at(30 * 8 - 5).gauge.erosion).toBe(1000);
  expect(h.at(30 * 8 + 2).gauge.erosion ?? 0).toBe(0);
  expect(h.at(30 * 8 + 6).def).toBe(500 - 2 * ELEMENT.erosion.enemy.defDown);
});

test('干员的元素爆发：灼燃 1200 法术；神经先晕 10 秒再 1000 真实；凋亡沉默、阻回、每秒 −1 技力与 100 法术；侵蚀先降防 100 再 800 物理，冷却 10 秒，降防可叠', () => {
  const op = ally('u', {
    attackRange: [],
    attributes: { hp: 1e6, atk: 0, def: 300, res: 0 },
    skills: [
      {
        id: 's',
        body: 'instant',
        trigger: 'NEVER',
        spCost: 30,
        initSp: 20,
        duration: 0,
        ammo: 0,
        spType: 'time',
      },
    ],
  });
  const T = 30;
  const h = open([op], 'u', {
    0: hit('u', 'burn'),
    [11 * T]: hit('u', 'neural'),
    [22 * T]: hit('u', 'apoptosis'),
    [38 * T]: hit('u', 'erosion'),
    [49 * T]: hit('u', 'erosion'),
  });
  h.run(50 * T);
  expect(1e6 - h.at(0).hp).toBe(ELEMENT.burn.ally.damage);
  const beforeNeural = h.at(11 * T - 1);
  const neural = h.at(11 * T);
  expect(beforeNeural.hp - neural.hp).toBe(ELEMENT.neural.ally.damage);
  expect(neural.tags).toContain(STUN.id);
  expect(h.at(11 * T + 10 * T - 2).tags).toContain(STUN.id);
  expect(h.at(11 * T + 10 * T + 2).tags).not.toContain(STUN.id);
  const beforeApoptosis = h.at(22 * T - 1);
  const threeSeconds = h.at(22 * T + 3 * T);
  expect(beforeApoptosis.hp - threeSeconds.hp).toBeCloseTo(
    3 * ELEMENT.apoptosis.ally.dps,
    6,
  );
  expect(h.at(22 * T).tags).toEqual(
    expect.arrayContaining([SILENCE.id, NO_SP.id, BURST_LOCK.id]),
  );
  expect(h.at(22 * T + 15 * T + 2).tags).not.toContain(SILENCE.id);
  expect(threeSeconds.sp).toBeLessThan(beforeApoptosis.sp);
  expect(threeSeconds.sp).toBeCloseTo(
    beforeApoptosis.sp - 3 * ELEMENT.apoptosis.ally.spLossPerSec,
    1,
  );
  const beforeErosion = h.at(38 * T - 1);
  const erosion = h.at(38 * T);
  expect(beforeErosion.hp - erosion.hp).toBeCloseTo(
    ELEMENT.erosion.ally.damage - (300 - ELEMENT.erosion.ally.defDown),
    6,
  );
  expect(erosion.def).toBe(300 - ELEMENT.erosion.ally.defDown);
  expect(h.at(38 * T + 10 * T - 5).gauge.erosion).toBe(1000);
  expect(h.at(49 * T).def).toBe(300 - 2 * ELEMENT.erosion.ally.defDown);
});

test('爆发冷却：爆发期间别的元素也不进槽，冷却结束时所有槽归零，之后照常进槽', () => {
  const h = open([enemy], 'e', {
    0: (ctx) => {
      hit('e', 'neural', 400)(ctx);
      hit('e', 'burn')(ctx);
      hit('e', 'neural')(ctx);
    },
    [30 * 10 + 5]: hit('e', 'neural', 300),
  });
  h.run(30 * 10 + 6);
  expect(h.at(0).gauge).toMatchObject({ burn: 1000, neural: 400 });
  expect(h.at(0).tags).toContain(BURST_LOCK.id);
  expect(h.at(30 * 10 - 5).gauge).toMatchObject({ burn: 1000, neural: 400 });
  expect(
    Object.values(h.at(30 * 10 + 2).gauge).every((value) => value === 0),
  ).toBe(true);
  expect(h.at(30 * 10 + 5).gauge.neural).toBeCloseTo(300, 6);
});

test('爆发时槽已锁：element-burst 回调把同一元素再撒给所有友方，每个单位只爆一次，不来回递归', () => {
  for (const element of ['burn', 'erosion', 'apoptosis', 'neural']) {
    const bursts: string[] = [];
    const op = (id: string) =>
      ally(id, {
        attackRange: [],
        attributes: { hp: 1e6, atk: 0, def: 300, res: 0 },
      });
    const module: MissionModule = {
      id: 'case',
      install(ctx) {
        ctx.subscribe('element-burst', (event, runCtx) => {
          bursts.push(event.data.targetId);
          for (const id of ['a', 'b']) {
            runCtx.dealDamage({
              sourceId: id,
              targetId: id,
              amount: 5000,
              kind: 'element',
              element,
            });
          }
        });
        ctx.registerSystem({
          id: 'plan',
          slot: 'schedule',
          priority: 1,
          run: (runCtx) => {
            if (runCtx.tick() === 0) {
              runCtx.dealDamage({
                sourceId: 'a',
                targetId: 'a',
                amount: 1000,
                kind: 'element',
                element,
              });
            }
          },
        });
      },
    };
    const battle = createBattle(
      spec({ modules: ['case'], units: [op('a'), op('b')] }),
      [module],
    );
    battle.step();
    expect(bursts.sort(), element).toEqual(['a', 'b']);
  }
});

test('损伤抵抗：单位的 elementRes 是百分比，进槽 = 损伤 × (1 − elementRes × 0.01)', () => {
  const resisted = ally('r', {
    side: 'enemy',
    attackRange: [],
    attributes: { hp: 1e6, atk: 0, def: 0, elementRes: 10 },
  });
  const h = open([resisted], 'r', { 0: hit('r', 'burn', 500) });
  h.run(1);
  expect(h.at(0).gauge.burn).toBeCloseTo(450, 6);
});
