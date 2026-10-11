import {
  ALLY_TARGET,
  type AttackShape,
  type BattleEvent,
  type ContentContext,
  createBattle,
  HEAL_FREE,
  type MissionModule,
  NO_ALLY_HEAL,
  NO_HEAL,
  type UnitSpec,
} from 'arknights-mission-core';
import { expect, test } from 'vitest';
import { ally, spec } from '#test/fixture.js';

const tiles = Array.from({ length: 8 }, (_, x) => ({
  x,
  y: 0,
  height: 0,
  deployable: true,
  walkableBy: ['ground'],
}));

type Heal = {
  readonly tick: number;
  readonly sourceId: string;
  readonly unitId: string;
  readonly amount: number;
};

function open(
  units: UnitSpec[],
  marked: readonly string[],
  plan: Readonly<Record<number, (ctx: ContentContext) => void>> = {},
) {
  const module: MissionModule = {
    id: 'case',
    install(ctx) {
      ctx.registerSelector({
        id: 'marked',
        kind: 'filter',
        filter: (unitId) => marked.includes(unitId),
        compare: () => 0,
      });
      ctx.registerSystem({
        id: 'plan',
        slot: 'schedule',
        priority: 1,
        run: (runCtx) => plan[runCtx.tick()]?.(runCtx),
      });
    },
  };
  const battle = createBattle(spec({ modules: ['case'], tiles, units }), [
    module,
  ]);
  battle.drainEvents();
  const heals: Heal[] = [];
  let tick = 0;
  const collect = (event: BattleEvent) => {
    if (event.type === 'heal') {
      heals.push({
        tick,
        sourceId: event.data.sourceId,
        unitId: event.data.unitId,
        amount: event.data.amount,
      });
    }
  };
  return {
    heals,
    run(count: number) {
      for (let index = 0; index < count; index += 1) {
        battle.step();
        for (const event of battle.drainEvents()) {
          collect(event);
        }
        tick += 1;
      }
    },
    /** 治疗者第一次出手治到的人，按顺序。 */
    first(sourceId: string): readonly string[] {
      const at = heals.find((heal) => heal.sourceId === sourceId)?.tick;
      return heals
        .filter((heal) => heal.sourceId === sourceId && heal.tick === at)
        .map((heal) => heal.unitId);
    },
  };
}

const medic = (shape: AttackShape = {}, patch: Partial<UnitSpec> = {}) =>
  ally('m', {
    x: 2,
    timers: ['attack'],
    attackRange: [0, 1, 2].map((x) => ({ x, y: 0 })),
    attackShape: { damage: 'heal', ...shape },
    attributes: { hp: 1e4, maxHp: 1e4, atk: 100, def: 0, bat: 1 },
    ...patch,
  });
const wounded = (id: string, x: number, tags: string[], ratio = 0.1) =>
  ally(id, {
    x,
    attackRange: [],
    tags,
    attributes: { hp: 1e4 * ratio, maxHp: 1e4, atk: 0, def: 0 },
  });

test('治疗者的 healThrough 选中并治疗它认的禁疗友方，不认的照旧跳过；没写时谁也不治', () => {
  const plain = open(
    [medic(), wounded('a', 3, [NO_HEAL.id]), wounded('b', 4, [NO_HEAL.id])],
    ['a'],
  );
  plain.run(120);
  expect(plain.heals.filter((heal) => heal.sourceId === 'm')).toEqual([]);

  const through = open(
    [
      medic({ healThrough: 'marked' }),
      wounded('a', 3, [NO_HEAL.id]),
      wounded('b', 4, [NO_HEAL.id]),
    ],
    ['a'],
  );
  through.run(120);
  expect(
    through.heals.some((heal) => heal.sourceId === 'm' && heal.unitId === 'a'),
  ).toBe(true);
  expect(
    through.heals.some((heal) => heal.sourceId === 'm' && heal.unitId === 'b'),
  ).toBe(false);
});

test('穿过 no-heal 与 heal-free 只对这个治疗者有效；no-ally-heal 谁也穿不过，来自自己的生命回复照常', () => {
  const healed = (
    h: ReturnType<typeof open>,
    sourceId: string,
    unitId: string,
  ) =>
    h.heals
      .filter((heal) => heal.sourceId === sourceId && heal.unitId === unitId)
      .reduce((sum, heal) => sum + heal.amount, 0);
  const h = open(
    [
      medic({ healThrough: 'marked' }, { timers: [] }),
      wounded('a', 3, [NO_HEAL.id]),
      wounded('b', 4, [NO_HEAL.id]),
    ],
    ['a'],
    {
      1: (ctx) => {
        ctx.heal('a', 100, { sourceId: 'm' });
        ctx.heal('b', 100, { sourceId: 'm' });
        ctx.heal('a', 100, { sourceId: 'b' });
      },
      2: (ctx) => {
        ctx.grantTag('a', HEAL_FREE, 'case');
        ctx.heal('a', 50, { sourceId: 'm' });
        ctx.heal('a', 50, { sourceId: 'b' });
      },
      3: (ctx) => {
        ctx.grantTag('a', NO_ALLY_HEAL, 'case');
        ctx.heal('a', 50, { sourceId: 'm' });
        ctx.heal('a', 30, { self: true, regen: true });
      },
    },
  );
  h.run(2);
  expect(healed(h, 'm', 'a')).toBe(100);
  expect(healed(h, 'm', 'b')).toBe(0);
  expect(healed(h, 'b', 'a')).toBe(0);
  h.run(1);
  expect(healed(h, 'm', 'a')).toBe(150);
  expect(healed(h, 'b', 'a')).toBe(0);
  h.run(1);
  expect(healed(h, 'm', 'a')).toBe(150);
  expect(
    h.heals
      .filter((heal) => heal.tick === 3 && heal.unitId === 'a')
      .map((heal) => heal.amount),
  ).toEqual([30]);
});

test('治疗链经 healThrough 跳到它认的禁疗友方，再从它接着跳；no-ally-heal 的跳不过去', () => {
  const chain = (tags: string[]) =>
    open(
      [
        medic(
          { healThrough: 'marked', chain: { count: 3, falloff: 0 } },
          { x: 0, attackRange: [0, 1, 2, 3, 4, 5].map((x) => ({ x, y: 0 })) },
        ),
        wounded('a', 3, [], 0.5),
        wounded('n', 4, tags, 0.6),
        wounded('c', 5, [], 0.7),
      ],
      ['n'],
    );
  const plain = open(
    [
      medic(
        { chain: { count: 3, falloff: 0 } },
        { x: 0, attackRange: [0, 1, 2, 3, 4, 5].map((x) => ({ x, y: 0 })) },
      ),
      wounded('a', 3, [], 0.5),
      wounded('n', 4, [NO_HEAL.id], 0.6),
      wounded('c', 5, [], 0.7),
    ],
    ['n'],
  );
  plain.run(60);
  expect(plain.first('m')).toEqual(['a']);

  const through = chain([NO_HEAL.id]);
  through.run(60);
  expect(through.first('m')).toEqual(['a', 'n', 'c']);

  const locked = chain([NO_HEAL.id, NO_ALLY_HEAL.id]);
  locked.run(60);
  expect(locked.first('m')).toEqual(['a']);
});

test('带 ally-target 的友方照常是治疗攻击与治疗链的目标', () => {
  const h = open(
    [
      medic(
        { chain: { count: 2, falloff: 0 } },
        { x: 0, attackRange: [0, 1, 2, 3, 4].map((x) => ({ x, y: 0 })) },
      ),
      wounded('t', 3, [ALLY_TARGET.id], 0.5),
      wounded('u', 4, [ALLY_TARGET.id], 0.6),
    ],
    [],
  );
  h.run(60);
  expect(h.first('m')).toEqual(['t', 'u']);
});
