import {
  type BattleEvent,
  createBattle,
  FUNNEL,
  FUNNEL_DEFAULTS,
  type MissionModule,
  officialFunnelModule,
  type TileSpec,
  type UnitSpec,
} from 'arknights-mission-core';
import { expect, test } from 'vitest';
import { HIT_COUNT } from '#port/tag.js';
import { ally, spec } from '#test/fixture.js';

const lane: readonly TileSpec[] = [0, 1, 2, 3].flatMap((x) =>
  [0, 1].map((y) => ({
    x,
    y,
    height: 0,
    deployable: true,
    walkableBy: ['ground'],
  })),
);

function caster(patch: Partial<UnitSpec> = {}): UnitSpec {
  const unit = ally('a', {
    attributes: { hp: 100, atk: 100, def: 0 },
    attackRange: [
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 1, y: 1 },
    ],
    attackShape: { damage: 'arts' },
    tags: [FUNNEL.id],
    ...patch,
  });
  return patch.script ? { ...unit, script: patch.script } : unit;
}

function dummy(id: string, patch: Partial<UnitSpec> = {}): UnitSpec {
  return ally(id, {
    side: 'enemy',
    x: 1,
    y: 0,
    attributes: { hp: 1e8, maxHp: 1e8, def: 0, res: 0, moveSpeed: 0 },
    attackRange: [],
    ...patch,
  });
}

/** 开拍就给 a 起攻击计时，跑 ticks 拍，收下全部事件。 */
function run(
  units: UnitSpec[],
  ticks: number,
  hooks?: (ctx: Parameters<MissionModule['install']>[0]) => void,
): BattleEvent[] {
  const module: MissionModule = {
    id: 'case',
    dependsOn: ['official-funnel'],
    install(ctx) {
      hooks?.(ctx);
      ctx.registerSystem({
        id: 'arm',
        slot: 'schedule',
        priority: 1,
        run(runCtx) {
          if (runCtx.tick() === 0) {
            runCtx.startTimer('a', 'attack');
          }
        },
      });
    },
  };
  const battle = createBattle(
    spec({
      modules: ['official-funnel', 'case'],
      tiles: lane,
      units,
    }),
    [officialFunnelModule, module],
  );
  const events: BattleEvent[] = [];
  for (let tick = 0; tick < ticks; tick += 1) {
    battle.step();
    events.push(...battle.drainEvents());
  }
  return events;
}

const mine = (events: readonly BattleEvent[]) =>
  events.filter(
    (event): event is BattleEvent<'damaged'> =>
      event.type === 'damaged' && event.data.creditId === 'a',
  );

const volleys = (events: readonly BattleEvent[]) => {
  const out = new Map<string, BattleEvent<'damaged'>[]>();
  for (const event of mine(events)) {
    const id = event.data.attackId;
    if (id === undefined) {
      continue;
    }
    out.set(id, [...(out.get(id) ?? []), event]);
  }
  return [...out.values()];
};

test('每次普攻是攻击本体加一段浮游单元：共用攻击 id，本体算普攻，浮游单元按目标递增到上限', () => {
  const events = run([caster(), dummy('e')], 30 * 12);
  const shots = volleys(events);
  expect(shots.length).toBeGreaterThanOrEqual(8);
  shots.forEach((shot, index) => {
    expect(shot.map((event) => event.data.attack === true)).toEqual([
      true,
      false,
    ]);
    expect(shot[0]?.data.amount).toBeCloseTo(100, 9);
    expect(shot[1]?.data.amount).toBeCloseTo(
      100 *
        Math.min(
          FUNNEL_DEFAULTS.max,
          FUNNEL_DEFAULTS.init + index * FUNNEL_DEFAULTS.delta,
        ),
      9,
    );
  });
  const strikes = events.filter(
    (event) => event.type === 'attack-hit' && event.data.unitId === 'a',
  );
  expect(strikes).toHaveLength(shots.length);
});

test('没有 funnel 标签的单位不带浮游单元，也不带攻击 id', () => {
  const events = run([caster({ tags: [] }), dummy('e')], 30 * 3);
  const hits = mine(events);
  expect(hits.length).toBeGreaterThan(0);
  expect(hits.every((event) => event.data.attackId === undefined)).toBe(true);
});

test('脚本参数改写倍率与段数；本体与每段分别经过法抗与计次', () => {
  const script = {
    funnelInit: 0.5,
    funnelDelta: 0,
    funnelMax: 1,
    funnelDrones: 2,
  };
  const resisted = run(
    [
      caster({ script }),
      dummy('e', {
        attributes: { hp: 1e8, maxHp: 1e8, def: 0, res: 50, moveSpeed: 0 },
      }),
    ],
    30 * 3,
  );
  const [first] = volleys(resisted);
  expect(first?.map((event) => event.data.amount)).toEqual([50, 25, 25]);
  const counted = run(
    [caster({ script }), dummy('e', { tags: [HIT_COUNT.id] })],
    30 * 3,
  );
  const [once] = volleys(counted);
  expect(once?.map((event) => event.data.applied)).toEqual([1, 1, 1]);
});

test('本体致死时余下几段作废，也不转给别的目标；换目标后从首次倍率起算', () => {
  const events = run(
    [
      caster(),
      dummy('e', {
        attributes: { hp: 150, maxHp: 150, def: 0, res: 0, moveSpeed: 0 },
      }),
      dummy('f', { x: 2 }),
    ],
    30 * 8,
  );
  const shots = volleys(events);
  const onE = shots.filter((shot) => shot[0]?.data.targetId === 'e');
  expect(onE.map((shot) => shot.length)).toEqual([2, 1]);
  const second = mine(events).filter((event) => event.data.targetId === 'e');
  expect(second.map((event) => event.data.attack === true)).toEqual([
    true,
    false,
    true,
  ]);
  const onF = shots.filter((shot) => shot[0]?.data.targetId === 'f');
  expect(onF.length).toBeGreaterThan(0);
  expect(
    onF.every((shot) => shot.every((event) => event.data.targetId === 'f')),
  ).toBe(true);
  expect(onF[0]?.[1]?.data.amount).toBeCloseTo(100 * FUNNEL_DEFAULTS.init, 9);
});

test('投射物飞行中目标倒下：本体与浮游单元都不落下', () => {
  let launched = -1;
  const events = run(
    [
      caster({ attackShape: { damage: 'arts', projectile: 'orb' } }),
      dummy('e', { x: 2 }),
    ],
    30 * 2,
    (ctx) => {
      ctx.subscribe('projectile', (_event, runCtx) => {
        if (launched < 0) {
          launched = runCtx.tick();
          runCtx.loseHp('e', 1e9);
        }
      });
    },
  );
  expect(launched).toBeGreaterThanOrEqual(0);
  expect(mine(events)).toEqual([]);
});
