import {
  type BattleSpec,
  type ContentContext,
  createBattle,
  defineEffect,
  type MissionModule,
  redeployModule,
  type SkillSpec,
  type UnitSpec,
} from 'arknights-mission-core';
import { expect, test } from 'vitest';
import { ally, spec } from '#test/fixture.js';

type Plan = Readonly<Record<number, (ctx: ContentContext) => void>>;

interface SkillView {
  readonly sp: number;
  readonly charges: number;
  readonly active: number;
  readonly activations: number;
}

interface Note {
  readonly tick: number;
  readonly type: string;
  readonly unitId: string;
  readonly reason: string;
  readonly left: number;
}

const ROW = [0, 1, 2, 3, 4, 5, 6].flatMap((x) =>
  [0, 1, 2].map((y) => ({
    x,
    y,
    height: 0,
    deployable: true,
    walkableBy: ['ground'],
  })),
);

/** 按计划在 schedule 槽调用内容接口，记下技能事件、出手与受击，每拍在 finale 槽读技力计时器。 */
function arena(
  units: UnitSpec[],
  plan: Plan = {},
  patch: Partial<BattleSpec> = {},
  extra: MissionModule[] = [],
  install?: MissionModule['install'],
) {
  const notes: Note[] = [];
  const views = new Map<string, SkillView[]>();
  const atk = new Map<string, number[]>();
  let tick = 0;
  const watched = units
    .filter((unit) => unit.skills.length > 0)
    .map((unit) => unit.id);
  const module: MissionModule = {
    id: 'case',
    install(ctx) {
      install?.(ctx);
      for (const type of [
        'skill-start',
        'skill-end',
        'ammo-used',
        'attack-hit',
        'damaged',
      ] as const) {
        ctx.subscribe(type, (event) => {
          const data = event.data as Record<string, unknown>;
          notes.push({
            tick,
            type,
            unitId: String(data.unitId ?? data.targetId ?? ''),
            reason: String(data.reason ?? ''),
            left: Number(data.left ?? -1),
          });
        });
      }
      ctx.registerSystem({
        id: 'plan',
        slot: 'schedule',
        priority: 1,
        run(runCtx) {
          tick = runCtx.tick();
          plan[tick]?.(runCtx);
        },
      });
      ctx.registerSystem({
        id: 'read',
        slot: 'finale',
        priority: 0,
        run(runCtx) {
          for (const unitId of watched) {
            const view = runCtx.timerView(unitId, 'skill-point');
            const list = views.get(unitId) ?? [];
            list.push({
              sp: Number(view.sp ?? 0),
              charges: Number(view.charges ?? 0),
              active: Number(view.active ?? 0),
              activations: Number(view.activations ?? 0),
            });
            views.set(unitId, list);
            const atks = atk.get(unitId) ?? [];
            atks.push(runCtx.attribute(unitId, 'atk'));
            atk.set(unitId, atks);
          }
        },
      });
    },
  };
  const battle = createBattle(
    spec({
      tiles: ROW,
      ...patch,
      modules: ['case', ...(patch.modules ?? [])],
      units,
    }),
    [module, ...extra],
  );
  let steps = 0;
  return {
    battle,
    notes,
    run(count: number) {
      for (let index = 0; index < count; index += 1) {
        battle.step();
        steps += 1;
      }
    },
    /** 走完第 step 拍时的读数，从 1 数起；缺省是最近一拍。 */
    view(unitId: string, step = steps): SkillView {
      const view = views.get(unitId)?.[step - 1];
      if (!view) {
        throw new Error(`no view of ${unitId} at ${step}`);
      }
      return view;
    },
    atk(unitId: string, step = steps): number {
      return atk.get(unitId)?.[step - 1] ?? Number.NaN;
    },
    of(type: string, unitId?: string): Note[] {
      return notes.filter(
        (note) =>
          note.type === type &&
          (unitId === undefined || note.unitId === unitId),
      );
    },
  };
}

function skill(patch: Partial<SkillSpec> = {}): SkillSpec {
  return {
    id: 's',
    body: 'duration',
    trigger: 'DEFAULT',
    spCost: 10,
    duration: 3,
    ammo: 0,
    operation: 'AUTO',
    ...patch,
  };
}

/** 每秒出手一次、攻击范围是面前三格的干员。 */
function shooter(
  id: string,
  skills: SkillSpec[],
  patch: Partial<UnitSpec> = {},
): UnitSpec {
  return ally(id, {
    attributes: {
      hp: 1000,
      maxHp: 1000,
      atk: 100,
      def: 0,
      aspd: 100,
      bat: 1,
      spRecovery: 1,
    },
    attackRange: [
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ],
    timers: ['attack'],
    skills,
    ...patch,
  });
}

function dummy(
  id: string,
  x: number,
  y = 0,
  patch: Partial<UnitSpec> = {},
): UnitSpec {
  return ally(id, {
    side: 'enemy',
    x,
    y,
    facing: 'LEFT',
    attackRange: [],
    attributes: { hp: 1e9, atk: 0, def: 0 },
    ...patch,
  });
}

const PERCENT_ATK = [{ attribute: 'atk', op: 'percent' as const, value: 1 }];

test('眩晕期间技力照涨、冻结也照涨，技力满了也不放技能，眩晕结束后才放', () => {
  const h = arena(
    [
      shooter(
        'stunned',
        [skill({ trigger: 'SP_FULL', spCost: 30, initSp: 25, spType: 'time' })],
        { attackRange: [] },
      ),
      shooter(
        'frozen',
        [skill({ trigger: 'NEVER', spCost: 30, initSp: 0, spType: 'time' })],
        { y: 1, attackRange: [] },
      ),
    ],
    {
      0: (ctx) => {
        ctx.applyEffect('stunned', 'stun', { duration: 8 });
        ctx.applyEffect('frozen', 'freeze', { duration: 5 });
      },
    },
  );
  h.run(90);
  expect(h.view('frozen').sp).toBeCloseTo(3, 9);
  h.run(149);
  expect(h.view('stunned').charges).toBe(1);
  expect(h.view('stunned').activations).toBe(0);
  h.run(1);
  expect(h.view('stunned').activations).toBe(1);
});

test('部署即开的持续技能：开场同拍开始、只有一层、到点结束；倒下与再部署后重新完整计时', () => {
  const h = arena(
    [
      shooter(
        'a',
        [
          skill({
            body: 'duration',
            trigger: 'NEVER',
            spCost: 0,
            duration: 4,
            spType: 'none',
            activateOnDeploy: true,
            mods: PERCENT_ATK,
          }),
        ],
        {
          attackRange: [],
          attributes: {
            hp: 1000,
            maxHp: 1000,
            atk: 100,
            def: 0,
            cost: 0,
            respawnTime: 1,
          },
        },
      ),
    ],
    {
      130: (ctx) => {
        expect(ctx.gainSp('a', 's', 100)).toBe(0);
      },
      150: (ctx) =>
        ctx.dealDamage({
          sourceId: 'a',
          targetId: 'a',
          amount: 1e6,
          kind: 'true',
        }),
    },
    {
      modules: ['redeploy'],
      cost: {
        ally: { initial: 10, regen: 0, cap: 10 },
        enemy: { initial: 0, regen: 0, cap: 0 },
      },
    },
    [redeployModule],
  );
  h.run(1);
  expect(
    h.of('skill-start', 'a').map((note) => [note.tick, note.reason]),
  ).toEqual([[0, 'deploy']]);
  expect(h.view('a')).toEqual({ sp: 0, charges: 0, active: 1, activations: 1 });
  expect(h.atk('a')).toBe(200);
  h.run(118);
  expect(h.view('a').active).toBe(1);
  h.run(1);
  expect(h.view('a').active).toBe(0);
  expect(h.atk('a')).toBe(100);
  expect(h.of('skill-end', 'a').map((note) => note.reason)).toEqual([
    'duration',
  ]);
  h.run(60);
  expect(h.of('skill-end', 'a')).toHaveLength(1);
  h.run(40);
  const starts = h.of('skill-start', 'a');
  expect(starts).toHaveLength(2);
  const back = starts[1]?.tick ?? 0;
  expect(back).toBeGreaterThan(150);
  h.run(back + 120 - 220);
  expect(h.view('a').active).toBe(1);
  expect(h.view('a').charges).toBe(0);
  h.run(1);
  expect(h.view('a').active).toBe(0);
});

test('持续中倒下：当场以 death 结束、修饰撤下，再部署后的新窗口不被旧的到点结束', () => {
  const h = arena(
    [
      shooter(
        'a',
        [
          skill({
            body: 'duration',
            trigger: 'NEVER',
            spCost: 0,
            duration: 4,
            spType: 'none',
            activateOnDeploy: true,
            mods: PERCENT_ATK,
          }),
        ],
        {
          attackRange: [],
          attributes: {
            hp: 1000,
            maxHp: 1000,
            atk: 100,
            def: 0,
            cost: 0,
            respawnTime: 1,
          },
        },
      ),
    ],
    {
      30: (ctx) =>
        ctx.dealDamage({
          sourceId: 'a',
          targetId: 'a',
          amount: 1e6,
          kind: 'true',
        }),
    },
    {
      modules: ['redeploy'],
      cost: {
        ally: { initial: 10, regen: 0, cap: 10 },
        enemy: { initial: 0, regen: 0, cap: 0 },
      },
    },
    [redeployModule],
  );
  h.run(31);
  expect(
    h.of('skill-end', 'a').map((note) => [note.tick, note.reason]),
  ).toEqual([[30, 'death']]);
  expect(h.atk('a')).toBe(100);
  h.run(60);
  const back = h.of('skill-start', 'a')[1]?.tick ?? 0;
  expect(back).toBeGreaterThan(30);
  h.run(back + 120 - 91);
  expect(h.view('a').active).toBe(1);
  expect(h.of('skill-end', 'a')).toHaveLength(1);
  h.run(1);
  expect(h.of('skill-end', 'a').map((note) => note.reason)).toEqual([
    'death',
    'duration',
  ]);
  expect(h.view('a').charges).toBe(0);
});

test('随时间回技力：从 initSp 起涨，涨满停在 spCost；DEFAULT 要初始范围里有敌人才放，持续期间不回技力', () => {
  const h = arena(
    [
      shooter('a', [
        skill({
          spCost: 5,
          initSp: 2,
          duration: 3,
          spType: 'time',
          mods: PERCENT_ATK,
        }),
      ]),
    ],
    {},
    { spawns: [{ atTick: 180, unit: dummy('e', 2) }] },
  );
  h.run(1);
  expect(h.view('a').sp).toBeCloseTo(2 + 1 / 30, 9);
  h.run(179);
  expect(h.view('a')).toEqual({ sp: 5, charges: 1, active: 0, activations: 0 });
  h.run(3);
  expect(h.view('a').activations).toBe(1);
  expect(h.view('a').active).toBe(1);
  expect(h.atk('a')).toBe(200);
  const sp = h.view('a').sp;
  h.run(30);
  expect(h.view('a').sp).toBe(sp);
  h.run(70);
  expect(h.view('a').active).toBe(0);
  expect(h.atk('a')).toBe(100);
  expect(h.of('skill-start', 'a')).toHaveLength(1);
  expect(h.of('skill-end', 'a')).toHaveLength(1);
});

test('攻击回技力每次出手 +1，受击回技力每次受击 +1', () => {
  const h = arena([
    shooter('sniper', [skill({ spCost: 100, spType: 'attack' })]),
    shooter('tank', [skill({ spCost: 100, spType: 'hurt' })], {
      y: 1,
      attackRange: [],
      attributes: { hp: 1e6, maxHp: 1e6, atk: 0, def: 0 },
    }),
    dummy('e', 2),
    dummy('hitter', 1, 1, {
      attackRange: [{ x: 1, y: 0 }],
      timers: ['attack'],
      attributes: { hp: 1e9, atk: 10, def: 0, aspd: 100, bat: 1 },
    }),
  ]);
  h.run(150);
  expect(h.view('sniper').sp).toBe(h.of('attack-hit', 'sniper').length);
  expect(h.view('sniper').sp).toBeGreaterThanOrEqual(4);
  expect(h.view('tank').sp).toBe(h.of('damaged', 'tank').length);
  expect(h.view('tank').sp).toBeGreaterThanOrEqual(4);
});

test('TAKE_DAMAGE 备好后第一次受击就放；SP_FULL 备好就放；SEARCH 只认初始范围里的敌人', () => {
  const h = arena(
    [
      shooter(
        'tank',
        [skill({ trigger: 'TAKE_DAMAGE', spCost: 1, initSp: 1, duration: 2 })],
        {
          attackRange: [],
          attributes: { hp: 1e6, maxHp: 1e6, atk: 0, def: 0 },
        },
      ),
      shooter(
        'bard',
        [skill({ trigger: 'SP_FULL', spCost: 1, initSp: 1, duration: 2 })],
        { y: 1, attackRange: [] },
      ),
      shooter(
        'phalanx',
        [skill({ trigger: 'SEARCH', spCost: 2, initSp: 0, duration: 2 })],
        { y: 2, timers: [] },
      ),
    ],
    {
      100: (ctx) =>
        ctx.dealDamage({
          sourceId: 'tank',
          targetId: 'tank',
          amount: 1,
          kind: 'true',
        }),
    },
    {
      spawns: [
        { atTick: 90, unit: dummy('far', 6, 0) },
        { atTick: 150, unit: dummy('near', 2, 2) },
      ],
    },
  );
  h.run(1);
  expect(h.view('bard').activations).toBe(1);
  expect(h.view('tank').activations).toBe(0);
  h.run(99);
  expect(h.view('tank').activations).toBe(0);
  h.run(1);
  expect(h.view('tank').activations).toBe(1);
  h.run(49);
  expect(h.view('phalanx').charges).toBe(1);
  expect(h.view('phalanx').activations).toBe(0);
  h.run(2);
  expect(h.view('phalanx').activations).toBe(1);
});

test('CUSTOM_RANGE 看 triggerRange，攻击范围里有敌人也不放', () => {
  const custom = skill({
    trigger: 'CUSTOM_RANGE',
    spCost: 1,
    initSp: 1,
    duration: 2,
    triggerRange: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ],
  });
  const outside = arena([shooter('a', [custom]), dummy('e', 3)]);
  outside.run(60);
  expect(outside.view('a').activations).toBe(0);
  expect(outside.of('attack-hit', 'a').length).toBeGreaterThan(0);
  const inside = arena([shooter('a', [custom]), dummy('e', 1)]);
  inside.run(2);
  expect(inside.view('a').activations).toBe(1);
});

test('弹药技能每发送出 ammo-used，打空后以 ammo 结束，持续中不回技力', () => {
  const h = arena([
    shooter('a', [
      skill({
        body: 'ammo',
        ammo: 4,
        duration: 0,
        spCost: 5,
        initSp: 5,
        spType: 'time',
      }),
    ]),
    dummy('e', 2),
  ]);
  h.run(2);
  expect(h.view('a').active).toBe(1);
  h.run(150);
  expect(h.view('a').active).toBe(0);
  expect(h.of('ammo-used', 'a').map((note) => note.left)).toEqual([3, 2, 1, 0]);
  expect(h.of('skill-end', 'a').map((note) => note.reason)).toEqual(['ammo']);
  const end = h.of('skill-end', 'a')[0]?.tick ?? 0;
  const start = h.of('skill-start', 'a')[0]?.tick ?? 0;
  expect(h.view('a', end).sp).toBe(0);
  expect(h.view('a', start + 1).sp).toBe(0);
});

test('充能涨到上限，满层时技力条停在 spCost；每次释放用一层，用掉满层后技力条从 0 开始；MANUAL 自动释放间隔 3 秒', () => {
  const h = arena(
    [
      shooter('a', [
        skill({
          body: 'charges',
          duration: 0,
          spCost: 2,
          initSp: 0,
          charges: 3,
          operation: 'MANUAL',
          spType: 'time',
        }),
      ]),
    ],
    {},
    { spawns: [{ atTick: 210, unit: dummy('e', 2) }] },
  );
  h.run(210);
  expect(h.view('a')).toEqual({ sp: 2, charges: 3, active: 0, activations: 0 });
  h.run(2);
  expect(h.view('a').activations).toBe(1);
  expect(h.view('a').charges).toBe(2);
  expect(h.view('a').sp).toBeLessThan(0.1);
  const first = h.of('skill-start', 'a')[0]?.tick ?? 0;
  h.run(first + 89 - 212);
  expect(h.view('a').activations).toBe(1);
  h.run(40);
  const second = h.of('skill-start', 'a')[1]?.tick ?? 0;
  expect(second - first).toBeGreaterThanOrEqual(90);
});

test('带替换攻击的立即技能只作用于一次攻击', () => {
  const hits: number[] = [];
  const h = arena(
    [
      shooter('a', [
        skill({
          body: 'instant',
          duration: 0,
          spCost: 100,
          initSp: 100,
          spType: 'time',
          hooks: { hit: 'boost' },
        }),
      ]),
      dummy('e', 1),
    ],
    {},
    {},
    [],
    (ctx) =>
      ctx.registerSkillHook({
        id: 'boost',
        run() {
          hits.push(1);
        },
      }),
  );
  h.run(75);
  expect(h.of('attack-hit', 'a').length).toBeGreaterThanOrEqual(3);
  expect(hits).toHaveLength(1);
  expect(h.of('skill-end', 'a').map((note) => note.reason)).toEqual([
    'instant',
  ]);
});

test('被动技能开场生效，开关技能放出后一直开着', () => {
  const h = arena([
    shooter(
      'p',
      [
        skill({
          body: 'passive',
          trigger: 'NEVER',
          spCost: 0,
          duration: 0,
          mods: PERCENT_ATK,
        }),
      ],
      { attackRange: [] },
    ),
    shooter(
      't',
      [
        skill({
          body: 'toggle',
          trigger: 'SP_FULL',
          spCost: 3,
          initSp: 3,
          duration: 0,
        }),
      ],
      { y: 1, attackRange: [] },
    ),
  ]);
  h.run(1);
  expect(h.atk('p')).toBe(200);
  expect(h.of('skill-start', 'p').map((note) => note.reason)).toEqual([
    'passive',
  ]);
  h.run(900);
  expect(h.view('t').active).toBe(1);
  expect(h.of('skill-end', 't')).toHaveLength(0);
});

test('spCostMul 与 spCostFlat 改变技力消耗，技力夹在消耗以内，满出的换成充能', () => {
  const h = arena(
    [
      shooter(
        'a',
        [skill({ trigger: 'NEVER', spCost: 10, initSp: 8, spType: 'none' })],
        { attackRange: [] },
      ),
    ],
    { 1: (ctx) => ctx.applyEffect('a', 'thrifty') },
    {},
    [],
    (ctx) =>
      ctx.registerEffect(
        defineEffect('thrifty', {
          modifiers: [{ attribute: 'spCostMul', op: 'mul', value: 0.7 }],
        }),
      ),
  );
  h.run(1);
  expect(h.view('a')).toEqual({ sp: 8, charges: 0, active: 0, activations: 0 });
  h.run(2);
  expect(h.battle.snapshot().units[0]?.skills[0]?.spCost).toBe(7);
  expect(h.view('a').charges).toBe(1);
  expect(h.view('a').sp).toBe(7);
});

test('部署时的被动技能开场送出 skill-start；部署即开的持续技能放完一次就不再备好', () => {
  const h = arena([
    shooter(
      'p',
      [skill({ body: 'passive', trigger: 'NEVER', spCost: 0, duration: 0 })],
      { attackRange: [] },
    ),
    shooter(
      'd',
      [
        skill({
          body: 'duration',
          trigger: 'NEVER',
          spCost: 0,
          duration: 8,
          spType: 'none',
          activateOnDeploy: true,
        }),
      ],
      { y: 1, attackRange: [] },
    ),
  ]);
  h.run(1);
  expect(h.of('skill-start').map((note) => [note.unitId, note.reason])).toEqual(
    [
      ['p', 'passive'],
      ['d', 'deploy'],
    ],
  );
  h.run(400);
  expect(h.view('p').active).toBe(1);
  expect(h.view('d').active).toBe(0);
  expect(h.of('skill-end', 'd').map((note) => note.reason)).toEqual([
    'duration',
  ]);
  expect(h.view('d').charges).toBe(0);
});

test('攻击回技力的立即技能每 spCost + 1 次出手放一次，技能那一下不回技力', () => {
  const positions: number[] = [];
  let attacks = 0;
  const h = arena(
    [
      shooter('a', [
        skill({
          body: 'instant',
          duration: 0,
          spCost: 3,
          initSp: 0,
          spType: 'attack',
          hooks: { hit: 'mark' },
        }),
      ]),
      dummy('e', 1),
    ],
    {},
    {},
    [],
    (ctx) => {
      ctx.subscribe('attack-hit', () => {
        attacks += 1;
      });
      ctx.registerSkillHook({
        id: 'mark',
        run() {
          positions.push(attacks);
        },
      });
    },
  );
  h.run(500);
  expect(positions.slice(0, 3)).toEqual([4, 8, 12]);
});

test('攻击回技力的弹药技能：每一发弹药都不回技力，最后一发也不回', () => {
  const h = arena([
    shooter('a', [
      skill({
        body: 'ammo',
        ammo: 3,
        duration: 0,
        spCost: 2,
        initSp: 0,
        spType: 'attack',
      }),
    ]),
    dummy('e', 1),
  ]);
  let end = 0;
  for (let step = 0; step < 600 && end === 0; step += 1) {
    h.run(1);
    end = h.of('skill-end', 'a')[0]?.tick ?? 0;
  }
  expect(h.of('attack-hit', 'a')).toHaveLength(5);
  expect(h.view('a').sp).toBe(0);
  for (
    let step = 0;
    step < 60 && h.of('attack-hit', 'a').length < 6;
    step += 1
  ) {
    h.run(1);
  }
  expect(h.view('a').sp).toBe(1);
});

const WIDE = [1, 2, 3, 4, 5].map((x) => ({ x, y: 0 }));

test('ACTIVE_RANGE 在持续时的范围上问基础策略：自身范围外、持续范围内有敌人就放，不等攻击；没有敌人不放', () => {
  const near = { attackRange: [{ x: 1, y: 0 }] };
  const h = arena([
    shooter(
      'a',
      [
        skill({
          trigger: 'ACTIVE_RANGE',
          spCost: 5,
          initSp: 5,
          triggerRange: WIDE,
        }),
      ],
      near,
    ),
    shooter(
      'b',
      [skill({ trigger: 'DEFAULT', spCost: 5, initSp: 5, triggerRange: WIDE })],
      { ...near, y: 1 },
    ),
    shooter(
      'c',
      [
        skill({
          trigger: 'ACTIVE_RANGE',
          spCost: 5,
          initSp: 5,
          triggerRange: WIDE,
        }),
      ],
      { ...near, y: 2 },
    ),
    dummy('e', 4),
    dummy('f', 4, 1),
  ]);
  h.run(2);
  expect(h.view('a').activations).toBe(1);
  expect(h.view('b').activations).toBe(0);
  expect(h.view('c').activations).toBe(0);
});

test('ACTIVE_RANGE 照基础策略筛敌人：打不中飞行单位时持续范围里的飞行敌人不算，打得中时算', () => {
  const h = arena([
    shooter(
      'a',
      [
        skill({
          trigger: 'ACTIVE_RANGE',
          spCost: 5,
          initSp: 5,
          triggerRange: WIDE,
        }),
      ],
      { attackRange: [{ x: 1, y: 0 }] },
    ),
    shooter(
      'b',
      [
        skill({
          trigger: 'ACTIVE_RANGE',
          spCost: 5,
          initSp: 5,
          triggerRange: WIDE,
        }),
      ],
      {
        y: 1,
        attackRange: [{ x: 1, y: 0 }],
        attributes: {
          hp: 1000,
          maxHp: 1000,
          atk: 100,
          def: 0,
          aspd: 100,
          bat: 1,
          spRecovery: 1,
          canHitFly: 1,
        },
      },
    ),
    dummy('e', 3, 0, { motion: 'FLY' }),
    dummy('f', 3, 1, { motion: 'FLY' }),
  ]);
  h.run(2);
  expect(h.view('a').activations).toBe(0);
  expect(h.view('b').activations).toBe(1);
});

test('ACTIVE_RANGE 的治疗技能看持续范围里的受伤友方，满血的不算', () => {
  const healer = (id: string, y: number) =>
    shooter(
      id,
      [
        skill({
          trigger: 'ACTIVE_RANGE',
          spCost: 5,
          initSp: 5,
          heal: true,
          triggerRange: WIDE,
        }),
      ],
      { y, attackRange: [{ x: 1, y: 0 }] },
    );
  const h = arena([
    healer('a', 0),
    healer('b', 1),
    ally('hurt', {
      x: 4,
      y: 0,
      attackRange: [],
      attributes: { hp: 500, maxHp: 1000 },
    }),
    ally('full', {
      x: 4,
      y: 1,
      attackRange: [],
      attributes: { hp: 1000, maxHp: 1000 },
    }),
  ]);
  h.run(2);
  expect(h.view('a').activations).toBe(1);
  expect(h.view('b').activations).toBe(0);
});

test('DEFAULT：自己挡着的敌人站在攻击范围外也满足基础策略，出手前放技能', () => {
  const h = arena([
    shooter('a', [skill({ trigger: 'DEFAULT', spCost: 5, initSp: 5 })], {
      attackRange: [{ x: 3, y: 0 }],
      blocking: ['e'],
    }),
    dummy('e', 1, 0, { blockedBy: 'a' }),
  ]);
  h.run(2);
  expect(h.view('a').activations).toBe(1);
});

test('技能触发只看永久攻击距离：rangeExtendBase 延伸 DEFAULT 与 ACTIVE_RANGE 的范围，rangeExtend 不延伸；no-range-extend 的技能不加', () => {
  const stats = (extra: Record<string, number>) => ({
    attackRange: [{ x: 1, y: 0 }],
    attributes: {
      hp: 1000,
      maxHp: 1000,
      atk: 100,
      def: 0,
      aspd: 100,
      bat: 1,
      spRecovery: 1,
      ...extra,
    },
  });
  const h = arena(
    [
      shooter(
        'a',
        [skill({ trigger: 'DEFAULT', spCost: 5, initSp: 5 })],
        stats({ rangeExtendBase: 1 }),
      ),
      shooter('b', [skill({ trigger: 'DEFAULT', spCost: 5, initSp: 5 })], {
        y: 1,
        ...stats({ rangeExtend: 1 }),
      }),
      shooter(
        'c',
        [
          skill({
            trigger: 'ACTIVE_RANGE',
            spCost: 5,
            initSp: 5,
            triggerRange: [{ x: 1, y: 0 }],
          }),
        ],
        { y: 2, ...stats({ rangeExtendBase: 1 }) },
      ),
      shooter(
        'd',
        [
          skill({
            trigger: 'ACTIVE_RANGE',
            spCost: 5,
            initSp: 5,
            triggerRange: [{ x: 1, y: 0 }],
            flags: ['no-range-extend'],
          }),
        ],
        {
          y: 3,
          ...stats({ rangeExtendBase: 1 }),
        },
      ),
      dummy('e', 2, 0),
      dummy('f', 2, 1),
      dummy('g', 2, 2),
      dummy('h', 2, 3),
    ],
    {},
    {
      tiles: [0, 1, 2, 3].flatMap((x) =>
        [0, 1, 2, 3].map((y) => ({
          x,
          y,
          height: 0,
          deployable: true,
          walkableBy: ['ground'],
        })),
      ),
    },
  );
  h.run(1);
  expect(h.view('a').activations).toBe(1);
  expect(h.view('b').activations).toBe(0);
  expect(h.view('c').activations).toBe(1);
  expect(h.view('d').activations).toBe(0);
});

test('内容的触发区域里有敌人时非治疗技能每拍按 DEFAULT 放：攻击者不等攻击，不攻击的也放；单位区域看它当前的攻击范围；治疗技能不看；撤下后不再算', () => {
  const ready = (trigger = 'DEFAULT', heal = false) => [
    skill({ trigger, spCost: 5, initSp: 5, heal }),
  ];
  const near = { attackRange: [{ x: 1, y: 0 }] };
  const h = arena(
    [
      shooter('sn', ready(), near),
      shooter('bd', ready(), { y: 1, attackRange: [] }),
      shooter('md', ready('DEFAULT', true), { y: 2, ...near }),
      shooter('off', ready(), { y: 3, ...near }),
      ally('gd', {
        x: 3,
        y: 1,
        attackRange: [
          { x: 1, y: 0 },
          { x: 2, y: 0 },
        ],
        attributes: { hp: 1000, atk: 0 },
      }),
      dummy('e', 5, 0),
      dummy('f', 5, 1),
      dummy('g', 5, 2),
      dummy('h', 5, 3),
    ],
    {
      0: (ctx) => {
        ctx.setTriggerArea('sn', 'beam', [{ x: 5, y: 0 }]);
        ctx.setTriggerArea('bd', 'guard', { unitId: 'gd' });
        ctx.setTriggerArea('md', 'beam', [{ x: 5, y: 2 }]);
        ctx.setTriggerArea('off', 'beam', [{ x: 5, y: 3 }]);
        ctx.setTriggerArea('off', 'beam', null);
      },
    },
    {
      tiles: [0, 1, 2, 3, 4, 5, 6].flatMap((x) =>
        [0, 1, 2, 3].map((y) => ({
          x,
          y,
          height: 0,
          deployable: true,
          walkableBy: ['ground'],
        })),
      ),
    },
  );
  h.run(2);
  expect(h.view('sn').activations).toBe(1);
  expect(h.of('attack-hit', 'sn')).toEqual([]);
  expect(h.view('bd').activations).toBe(1);
  expect(h.view('md').activations).toBe(0);
  expect(h.view('off').activations).toBe(0);
});

test('setExtraRange 的绝对格子算进攻击范围，换位置后照样在；不让 DEFAULT 触发；null 清掉', () => {
  const h = arena(
    [
      shooter('a', [skill({ trigger: 'DEFAULT', spCost: 5, initSp: 5 })], {
        attackRange: [{ x: 1, y: 0 }],
      }),
      dummy('e', 5, 0),
    ],
    {
      0: (ctx) =>
        ctx.setExtraRange('a', [
          { x: 5, y: 0 },
          { x: 5, y: 0 },
          { x: -3, y: 0 },
          { x: 1.5, y: 0 },
        ]),
      40: (ctx) => ctx.displace('a', 0, 1),
      80: (ctx) => ctx.setExtraRange('a', null),
    },
  );
  h.run(40);
  const before = h.of('attack-hit', 'a').length;
  expect(before).toBeGreaterThan(0);
  expect(h.view('a').activations).toBe(0);
  h.run(40);
  expect(h.of('attack-hit', 'a').length).toBeGreaterThan(before);
  const moved = h.of('attack-hit', 'a').length;
  h.run(40);
  expect(h.of('attack-hit', 'a').length).toBe(moved);
});

test('CUSTOM_RANGE 的触发格随单位朝向旋转：朝下时面前一格是 y 小一的那格，朝右时同一处的敌人不在触发格里', () => {
  const custom = () => [
    skill({
      trigger: 'CUSTOM_RANGE',
      spCost: 5,
      initSp: 5,
      triggerRange: [{ x: 1, y: 0 }],
    }),
  ];
  const h = arena(
    [
      shooter('down', custom(), {
        x: 1,
        y: 1,
        facing: 'DOWN',
        attackRange: [],
      }),
      shooter('right', custom(), {
        x: 4,
        y: 1,
        facing: 'RIGHT',
        attackRange: [],
      }),
      dummy('e', 1, 0),
      dummy('f', 4, 0),
    ],
    {},
    {
      tiles: [0, 1, 2, 3, 4, 5, 6].flatMap((x) =>
        [0, 1, 2].map((y) => ({
          x,
          y,
          height: 0,
          deployable: true,
          walkableBy: ['ground'],
        })),
      ),
    },
  );
  h.run(1);
  expect(h.view('down').activations).toBe(1);
  expect(h.view('right').activations).toBe(0);
});

test('普攻追加的筛选器：不过筛的敌人不打、挡着也不打、不让 DEFAULT 触发；过筛的敌人照常是目标', () => {
  const skip = new Set(['w']);
  const install: MissionModule['install'] = (ctx) => {
    ctx.registerSelector({
      id: 'case-skip',
      kind: 'filter',
      filter: (id) => !skip.has(id),
      compare: () => 0,
    });
  };
  const guard = shooter(
    'a',
    [skill({ trigger: 'DEFAULT', spCost: 5, initSp: 5 })],
    {
      attackRange: [
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ],
      attackShape: { filters: ['case-skip'] },
      blocking: ['w'],
    },
  );
  const alone = arena(
    [guard, dummy('w', 1, 0, { blockedBy: 'a' })],
    {},
    {},
    [],
    install,
  );
  alone.run(60);
  expect(alone.view('a').activations).toBe(0);
  // 只有 a 出手，damaged 记的是挨打的人
  const hurt = (h: ReturnType<typeof arena>) =>
    h.notes
      .filter((note) => note.type === 'damaged')
      .map((note) => note.unitId);
  expect(hurt(alone)).toEqual([]);
  const both = arena(
    [guard, dummy('w', 1, 0, { blockedBy: 'a' }), dummy('o', 2)],
    {},
    {},
    [],
    install,
  );
  both.run(60);
  expect(both.view('a').activations).toBe(1);
  expect(hurt(both).length).toBeGreaterThan(0);
  expect(new Set(hurt(both))).toEqual(new Set(['o']));
});

test('普攻的筛选器没注册时开场报错', () => {
  expect(() =>
    arena([shooter('a', [], { attackShape: { filters: ['case-missing'] } })]),
  ).toThrow(/case-missing/);
});
