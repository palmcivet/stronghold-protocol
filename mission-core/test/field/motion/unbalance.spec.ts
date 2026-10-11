import {
  type ContentContext,
  createBattle,
  type MissionModule,
  type RouteCheckpoint,
  SHIFT_PULL,
  SHIFT_PUSH,
  type TileSpec,
} from 'arknights-mission-core';
import { describe, expect, test } from 'vitest';
import { ally, spec } from '#test/fixture.js';

const lane: readonly TileSpec[] = Array.from({ length: 12 }, (_, x) => ({
  x,
  y: 0,
  height: 0,
  deployable: true,
  walkableBy: ['ground'],
}));
const wide = Array.from({ length: 25 }, (_, index) => ({
  x: index - 12,
  y: 0,
}));

interface Options {
  readonly start?: number;
  readonly mass?: number;
  readonly tags?: readonly string[];
  readonly target?: boolean;
  readonly checkpoints?: readonly RouteCheckpoint[];
  readonly plan?: Readonly<Record<number, (ctx: ContentContext) => unknown>>;
  readonly clip?: { duration: number; hit: number };
}

interface Row {
  readonly tick: number;
  readonly x: number;
  readonly until: number | null;
}

/** 敌人 e 从右往左走，左端可以放一个打不死的友方。按计划在 schedule 槽调用内容接口，记每拍的位置、失衡与命中。 */
function walk(options: Options, ticks: number) {
  const hits: number[] = [];
  const notes: unknown[] = [];
  const slides: number[] = [];
  const module: MissionModule = {
    id: 'case',
    install(ctx) {
      ctx.subscribe('attack-hit', (event) => {
        if (event.data.unitId === 'e') {
          hits.push(event.tick);
        }
      });
      ctx.subscribe('displace', (event) => {
        slides.push(event.data.duration);
      });
      ctx.registerSystem({
        id: 'plan',
        slot: 'schedule',
        priority: 1,
        run(runCtx) {
          const step = options.plan?.[runCtx.tick()];
          if (step) {
            notes.push(step(runCtx));
          }
        },
      });
    },
  };
  const enemy = ally('e', {
    side: 'enemy',
    x: options.start ?? 9,
    facing: 'LEFT',
    attributes: {
      hp: 1e9,
      atk: 1,
      def: 0,
      moveSpeed: 1,
      bat: 1,
      massLevel: options.mass ?? 0,
    },
    attackRange: options.target === true ? wide : [],
    tags: options.tags ?? [],
    timers: ['attack'],
    route: { checkpoints: options.checkpoints ?? [], end: { x: 0, y: 0 } },
    ...(options.clip ? { attackClip: options.clip } : {}),
  });
  const units =
    options.target === true
      ? [
          ally('a', {
            x: 0,
            attributes: { hp: 1e9, atk: 0, def: 1e6 },
            attackRange: [],
          }),
          enemy,
        ]
      : [enemy];
  const battle = createBattle(spec({ modules: ['case'], tiles: lane, units }), [
    module,
  ]);
  const rows: Row[] = [];
  for (let step = 0; step < ticks; step += 1) {
    battle.step();
    const unit = battle.snapshot().units.find((item) => item.id === 'e');
    if (!unit) {
      break;
    }
    rows.push({ tick: step, x: unit.x, until: unit.unbalanceUntil });
  }
  return { rows, hits, notes, slides };
}

const row = (rows: readonly Row[], tick: number): Row => {
  const found = rows.find((item) => item.tick === tick);
  if (!found) {
    throw new Error(`no tick ${tick}`);
  }
  return found;
};

describe('失衡', () => {
  test('推按受力等级失衡：中力推重量 0（受力等级 1）失衡 0.9 秒，期间不沿路线走，到时接着走', () => {
    const { rows } = walk(
      {
        plan: {
          5: (ctx) =>
            ctx.shift(SHIFT_PUSH, 'e', { force: 1, fromX: 0, fromY: 0 }),
        },
      },
      40,
    );
    const pushed = row(rows, 5);
    expect(pushed.until).toBe(5 + 27);
    // 快照在这一拍走完之后读：第 31 拍还站着，读到时已经是第 32 拍，失衡已结束
    for (let tick = 5; tick < 31; tick += 1) {
      expect(row(rows, tick)).toEqual({ tick, x: pushed.x, until: 32 });
    }
    expect(row(rows, 31)).toEqual({ tick: 31, x: pushed.x, until: null });
    expect(row(rows, 32).x).toBeLessThan(pushed.x);
  });

  test('推的每一档都按 30 帧的整拍：受力等级 −2 到 3 依次 6、12、24、27、32、35 拍，之后的一拍接着走；位移的画面时长是失衡秒数', () => {
    const frames = [6, 12, 24, 27, 32, 35];
    frames.forEach((count, index) => {
      const { rows, slides } = walk(
        {
          mass: 1,
          plan: {
            0: (ctx) =>
              ctx.shift(SHIFT_PUSH, 'e', {
                force: index - 1,
                fromX: 0,
                fromY: 0,
              }),
          },
        },
        40,
      );
      const start = row(rows, 0).x;
      const held = rows.filter((item) => item.x === start).length;
      expect(held).toBe(count);
      expect(slides[0]).toBeCloseTo(count / 30, 9);
    });
  });

  test('定向推偏离超过 45° 时按修正后的受力等级取档：中力推重量 1 修正到 −2，失衡 0.2 秒；特效列的推照样按这一档', () => {
    const angled = walk(
      {
        mass: 1,
        plan: {
          0: (ctx) =>
            ctx.shift(SHIFT_PUSH, 'e', {
              force: 1,
              fromX: 9,
              fromY: -1,
              dirX: 1,
              dirY: 0,
            }),
        },
      },
      2,
    );
    expect(row(angled.rows, 0).until).toBe(6);
    const effect = walk(
      {
        plan: {
          0: (ctx) =>
            ctx.shift(SHIFT_PUSH, 'e', {
              force: 1,
              fromX: 0,
              fromY: 0,
              effect: true,
            }),
        },
      },
      2,
    );
    expect(row(effect.rows, 0).until).toBe(27);
  });

  test('受力等级决定时长：大力推重量 0 是 35 拍，受力等级 −3 不推也不失衡', () => {
    expect(
      row(
        walk(
          {
            plan: {
              0: (ctx) =>
                ctx.shift(SHIFT_PUSH, 'e', { force: 3, fromX: 0, fromY: 0 }),
            },
          },
          2,
        ).rows,
        0,
      ).until,
    ).toBe(35);
    const none = walk(
      {
        mass: 3,
        plan: {
          0: (ctx) =>
            ctx.shift(SHIFT_PUSH, 'e', { force: 0, fromX: 0, fromY: 0 }),
        },
      },
      2,
    );
    expect(none.notes).toEqual([false]);
    expect(row(none.rows, 0).until).toBeNull();
  });

  test('推向墙、第一步就停下时只有失衡硬直的保底 0.1 秒', () => {
    const { rows, notes } = walk(
      {
        start: 11.45,
        plan: {
          0: (ctx) =>
            ctx.shift(SHIFT_PUSH, 'e', { force: 1, fromX: 0, fromY: 0 }),
        },
      },
      2,
    );
    expect(notes).toEqual([false]);
    expect(row(rows, 0)).toMatchObject({ x: 11.45, until: 3 });
  });

  test('拉在作用时间内失衡：拉不动（已在终点）也失衡 1 秒；受力等级低于 −1 时 0.5 秒', () => {
    const still = walk(
      {
        plan: {
          0: (ctx) => ctx.shift(SHIFT_PULL, 'e', { force: 1, toX: 9, toY: 0 }),
        },
      },
      2,
    );
    expect(still.notes).toEqual([false]);
    expect(row(still.rows, 0)).toMatchObject({ x: 9, until: 30 });
    const weak = walk(
      {
        mass: 4,
        plan: {
          0: (ctx) => ctx.shift(SHIFT_PULL, 'e', { force: 2, toX: 0, toY: 0 }),
        },
      },
      2,
    );
    expect(weak.notes).toEqual([true]);
    expect(row(weak.rows, 0).until).toBe(15);
  });

  test('静态刚体不动但照样失衡：推按保底，拉按作用时间；受力等级低于 −2 不失衡；位移免疫不失衡', () => {
    const push = walk(
      {
        tags: ['static-body'],
        plan: {
          0: (ctx) =>
            ctx.shift(SHIFT_PUSH, 'e', { force: 1, fromX: 0, fromY: 0 }),
        },
      },
      2,
    );
    expect(push.notes).toEqual([false]);
    expect(row(push.rows, 0)).toMatchObject({ x: 9, until: 3 });
    const pull = walk(
      {
        tags: ['static-body'],
        mass: 4,
        plan: {
          0: (ctx) => ctx.shift(SHIFT_PULL, 'e', { force: 2, toX: 0, toY: 0 }),
        },
      },
      2,
    );
    expect(row(pull.rows, 0)).toMatchObject({ x: 9, until: 15 });
    const weak = walk(
      {
        tags: ['static-body'],
        mass: 4,
        plan: {
          0: (ctx) => ctx.shift(SHIFT_PULL, 'e', { force: 1, toX: 0, toY: 0 }),
        },
      },
      2,
    );
    expect(row(weak.rows, 0).until).toBeNull();
    const immune = walk(
      {
        tags: ['static-body', 'no-displace'],
        plan: {
          0: (ctx) =>
            ctx.shift(SHIFT_PUSH, 'e', { force: 3, fromX: 0, fromY: 0 }),
        },
      },
      2,
    );
    expect(row(immune.rows, 0).until).toBeNull();
  });

  test('更长的失衡保留：失衡中再受一次较短的力不缩短', () => {
    const { rows } = walk(
      {
        plan: {
          0: (ctx) => ctx.shift(SHIFT_PULL, 'e', { force: 1, toX: 9, toY: 0 }),
          2: (ctx) =>
            ctx.shift(SHIFT_PUSH, 'e', { force: 0, fromX: 12, fromY: 0 }),
        },
      },
      4,
    );
    expect(row(rows, 1).until).toBe(30);
    expect(row(rows, 3).until).toBe(30);
    expect(rows.some((item) => item.until === 2 + 24)).toBe(false);
  });

  test('失衡期间不开始普攻、冷却停下，到时才打第一下', () => {
    const calm = walk({ target: true }, 3);
    expect(calm.hits[0]).toBe(0);
    const { hits } = walk(
      {
        target: true,
        plan: {
          0: (ctx) => ctx.shift(SHIFT_PULL, 'e', { force: 1, toX: 9, toY: 0 }),
        },
      },
      40,
    );
    expect(hits[0]).toBe(30);
  });

  test('恐惧也走不出失衡：失衡期间恐惧的位移停下，到时才走', () => {
    const { rows } = walk(
      {
        plan: {
          0: (ctx) => ctx.shift('fear', 'e', { sourceX: 11, sourceY: 0 }),
          1: (ctx) => ctx.shift(SHIFT_PULL, 'e', { force: 1, toX: 0, toY: 0 }),
        },
      },
      40,
    );
    const pulled = row(rows, 1).x;
    for (let tick = 1; tick < 31; tick += 1) {
      expect(row(rows, tick).x).toBe(pulled);
    }
    expect(row(rows, 31).x).not.toBe(pulled);
  });

  test('前摇中的失衡打断这一下，到时重新走完整个前摇', () => {
    const clip = { duration: 1, hit: 0.5 };
    const calm = walk({ target: true, clip }, 40).hits[0] ?? Number.NaN;
    const { hits } = walk(
      {
        target: true,
        clip,
        plan: {
          [calm - 3]: (ctx) =>
            ctx.shift(SHIFT_PULL, 'e', { force: 1, toX: 9, toY: 0 }),
        },
      },
      80,
    );
    expect(hits[0]).toBe(calm - 3 + 30 + calm);
  });

  test('浮空、路线上的出现与内容命令 cutUnbalance 立刻结束失衡；unbalanced 读当前状态', () => {
    const pull = (ctx: ContentContext) =>
      ctx.shift(SHIFT_PULL, 'e', { force: 1, toX: 9, toY: 0 });
    const lifted = walk(
      {
        plan: {
          0: pull,
          3: (ctx) => ctx.applyEffect('e', 'levitate', { duration: 1 }),
        },
      },
      5,
    );
    expect(row(lifted.rows, 2).until).toBe(30);
    expect(row(lifted.rows, 3).until).toBeNull();
    const cut = walk(
      {
        plan: {
          0: pull,
          1: (ctx) => ctx.unbalanced('e'),
          2: (ctx) => ctx.cutUnbalance('e'),
          3: (ctx) => ctx.unbalanced('e'),
        },
      },
      4,
    );
    expect(cut.notes).toEqual([false, true, null, false]);
    expect(row(cut.rows, 2).until).toBeNull();
    // 失衡时路线上的等待、消失与出现照常推进，出现结束失衡
    const appear = walk(
      {
        checkpoints: [
          { type: 'wait', time: 0.2 },
          { type: 'disappear' },
          { type: 'appear', x: 6, y: 0 },
        ],
        plan: { 0: pull },
      },
      12,
    );
    expect(row(appear.rows, 2).until).toBe(30);
    const shown = appear.rows.find((item) => item.x === 6);
    expect(shown?.until).toBeNull();
    expect(shown?.tick).toBeLessThan(10);
  });
});
