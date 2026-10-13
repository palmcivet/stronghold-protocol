import {
  CANNOT_CAST,
  createBattle,
  ISOLATED,
  type MissionModule,
  NO_ALLY_HEAL,
  NO_HEAL,
  type SkillSpec,
  type UnitSpec,
} from 'arknights-mission-core';
import { expect, test } from 'vitest';
import { ally, spec } from '#test/fixture.js';

// 对照 master「充能守护者治疗与混合技能触发」（#406）的用例：带友方条件、替换当次攻击的 DEFAULT 技能，
// 没有敌人时也按普攻节奏对半血以下的友方释放。治不了的友方不算伤员（master Battle.injuredAlliesInKeys）。

const TILES = [0, 1, 2].map((x) => ({
  x,
  y: 0,
  height: 0,
  deployable: true,
  walkableBy: ['ground'],
}));

function guard(
  patch: Partial<SkillSpec> = {},
  tags: string[] = [],
  unit: Partial<UnitSpec> = {},
): UnitSpec {
  return ally('g', {
    ...unit,
    timers: ['attack'],
    tags,
    attributes: {
      hp: 1000,
      atk: 50,
      def: 0,
      bat: 1,
      aspd: 100,
      spRecovery: 30,
    },
    skills: [
      {
        id: 's1',
        body: 'instant',
        trigger: 'DEFAULT',
        spCost: 1,
        initSp: 1,
        duration: 0,
        ammo: 0,
        operation: 'AUTO',
        triggerAllies: true,
        triggerHpAtMost: 0.5,
        hooks: { hit: 'mend' },
        ...patch,
      },
    ],
  });
}

/** 没有友方条件的同一个技能。 */
function plainGuard(): UnitSpec {
  const base = guard({ triggerAllies: false });
  const [skill] = base.skills;
  if (!skill) {
    throw new Error('guard has no skill');
  }
  const { triggerHpAtMost: _, ...rest } = skill;
  return { ...base, skills: [rest] };
}

function patient(hp: number, tags: string[] = []): UnitSpec {
  return ally('p', {
    x: 1,
    tags,
    attackRange: [],
    attributes: { hp, maxHp: 100000, atk: 0, def: 0 },
  });
}

function open(
  units: UnitSpec[],
  extra: MissionModule[] = [],
  marked: readonly string[] = [],
) {
  const casts: number[] = [];
  const swings: { tick: number; targets: readonly string[] }[] = [];
  const mends: number[] = [];
  let tick = 0;
  const watch: MissionModule = {
    id: 'watch',
    install(ctx) {
      ctx.registerSelector({
        id: 'marked',
        kind: 'filter',
        filter: (unitId) => marked.includes(unitId),
        compare: () => 0,
      });
      ctx.registerSkillHook({
        id: 'mend',
        run() {
          mends.push(tick);
        },
      });
      ctx.subscribe('skill-start', (event) => {
        casts.push(event.tick);
      });
      ctx.subscribe('attack-hit', (event) => {
        if (event.data.substitute === true) {
          swings.push({
            tick: event.tick,
            targets: event.data.targetIds ?? [],
          });
        }
      });
      ctx.registerSystem({
        id: 'clock',
        slot: 'schedule',
        priority: 0,
        run(runCtx) {
          tick = runCtx.tick();
        },
      });
    },
  };
  const battle = createBattle(
    spec({
      tiles: TILES,
      modules: ['watch', ...extra.map((module) => module.id)],
      units,
    }),
    [watch, ...extra],
  );
  return {
    battle,
    casts,
    swings,
    mends,
    run(count: number) {
      for (let index = 0; index < count; index += 1) {
        battle.step();
      }
    },
    hp(id: string) {
      return (
        battle.snapshot().units.find((unit) => unit.id === id)?.attributes.hp ??
        Number.NaN
      );
    },
  };
}

test('没有敌人时，半血以下的友方让替换普攻的技能释放：这一下打向它、不结算伤害，钩子照常；高于半血不放', () => {
  const above = open([guard(), patient(50010)]);
  above.run(60);
  expect(above.casts).toEqual([]);
  expect(above.swings).toEqual([]);

  const half = open([guard(), patient(50000)]);
  half.run(1);
  expect(half.casts).toEqual([0]);
  expect(half.swings).toEqual([{ tick: 0, targets: ['p'] }]);
  expect(half.mends).toEqual([0]);
  expect(half.hp('p')).toBe(50000);
});

test('治不了的友方不算伤员：no-heal 与 no-ally-heal 都不触发；healThrough 认的 no-heal 友方照常触发', () => {
  const banned = open([guard(), patient(10000, [NO_HEAL.id])]);
  banned.run(60);
  expect(banned.casts).toEqual([]);
  expect(banned.swings).toEqual([]);

  const isolated = open(
    [
      guard({}, [], { attackShape: { healThrough: 'marked' } }),
      patient(10000, [NO_ALLY_HEAL.id]),
    ],
    [],
    ['p'],
  );
  isolated.run(60);
  expect(isolated.casts).toEqual([]);

  const unmarked = open(
    [
      guard({}, [], { attackShape: { healThrough: 'marked' } }),
      patient(10000, [NO_HEAL.id]),
    ],
    [],
    [],
  );
  unmarked.run(60);
  expect(unmarked.casts).toEqual([]);

  const through = open(
    [
      guard({}, [], { attackShape: { healThrough: 'marked' } }),
      patient(10000, [NO_HEAL.id]),
    ],
    [],
    ['p'],
  );
  through.run(1);
  expect(through.casts).toEqual([0]);
  expect(through.swings).toEqual([{ tick: 0, targets: ['p'] }]);
});

test('只带孤立的友方仍算伤员（master injuredAlliesInKeys 不看孤立）：替换普攻的技能照常对它释放', () => {
  const h = open([guard(), patient(10000, [ISOLATED.id])]);
  h.run(1);
  expect(h.casts).toEqual([0]);
  expect(h.swings).toEqual([{ tick: 0, targets: ['p'] }]);
});

test('没有敌人时的释放按普攻节奏：两次至少隔一个攻击间隔', () => {
  const h = open([guard(), patient(20000)]);
  h.run(70);
  expect(h.casts.slice(0, 3)).toEqual([0, 30, 60]);
  expect(h.swings.map((swing) => swing.tick).slice(0, 3)).toEqual([0, 30, 60]);
});

test('不能施放时不放，也不出手；castWithoutEnemy 为 false 的技能没有敌人时等着', () => {
  const silenced = open([guard({}, [CANNOT_CAST.id]), patient(10000)]);
  silenced.run(60);
  expect(silenced.casts).toEqual([]);
  expect(silenced.swings).toEqual([]);

  const waits = open([guard({ castWithoutEnemy: false }), patient(10000)]);
  waits.run(60);
  expect(waits.casts).toEqual([]);

  const foe = ally('e', {
    side: 'enemy',
    x: 1,
    attackRange: [],
    attributes: { hp: 1e9, atk: 0, def: 0 },
  });
  const fights = open([
    guard({ castWithoutEnemy: false }),
    patient(10000),
    foe,
  ]);
  fights.run(2);
  expect(fights.casts).toEqual([0]);
  expect(fights.swings).toEqual([]);
});

test('没有友方条件的技能不替换；内容登记的普攻替代同样给出目标，重复 id 拒绝', () => {
  const plain = open([plainGuard(), patient(10000)]);
  plain.run(60);
  expect(plain.casts).toEqual([]);
  expect(plain.swings).toEqual([]);

  const decoy: MissionModule = {
    id: 'decoy',
    install(ctx) {
      ctx.registerAttackSubstitute({
        id: 'decoy:dummy',
        offer: (unitId) => (unitId === 'g' ? ['p'] : []),
      });
      expect(() =>
        ctx.registerAttackSubstitute({ id: 'decoy:dummy', offer: () => [] }),
      ).toThrow('decoy:dummy');
    },
  };
  const h = open([plainGuard(), patient(100000)], [decoy]);
  h.run(31);
  expect(h.swings.map((swing) => swing.tick)).toEqual([0, 30]);
  expect(h.hp('p')).toBe(100000);
});
