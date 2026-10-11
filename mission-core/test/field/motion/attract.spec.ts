import {
  type ContentContext,
  createBattle,
  type MissionModule,
  type Motion,
  SHIFT_ATTRACT,
} from 'arknights-mission-core';
import { describe, expect, test } from 'vitest';
import { ATTRACT } from '#port/tag.js';
import { ally, spec } from '#test/fixture.js';

const field = Array.from({ length: 10 }, (_, x) =>
  [0, 1, 2].map((y) => ({
    x,
    y,
    height: 0,
    deployable: true,
    walkableBy: ['ground', 'fly'],
  })),
).flat();

type Plan = Readonly<Record<number, (ctx: ContentContext) => unknown>>;

/** 敌人 e 在 (6, 1) 往 (0, 1) 走，速度 1（每秒 0.5 格）。按计划在 schedule 槽调用内容接口，记每拍之后的坐标。 */
function lure(
  plan: Plan,
  ticks: number,
  motion: Motion = 'WALK',
  notes: unknown[] = [],
) {
  const module: MissionModule = {
    id: 'case',
    install(ctx) {
      ctx.registerSystem({
        id: 'plan',
        slot: 'schedule',
        priority: 0,
        run(runCtx) {
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
      tiles: field,
      units: [
        ally('e', {
          side: 'enemy',
          x: 6,
          y: 1,
          motion,
          attackRange: [],
          attributes: { hp: 1e9, moveSpeed: 1 },
          route: { checkpoints: [], end: { x: 0, y: 1 } },
        }),
      ],
    }),
    [module],
  );
  const rows: { x: number; y: number }[] = [];
  for (let step = 0; step < ticks; step += 1) {
    battle.step();
    const unit = battle.snapshot().units.find((item) => item.id === 'e');
    if (unit) {
      rows.push({ x: unit.x, y: unit.y });
    }
  }
  return rows;
}

const attract =
  (seconds: number, x: number, y: number) => (ctx: ContentContext) => {
    ctx.applyEffect('e', 'attract', { duration: seconds });
    ctx.shift(SHIFT_ATTRACT, 'e', { toX: x, toY: y });
  };

describe('诱导', () => {
  test('按自身速度走到诱导点，诱导还在时停在那里，诱导结束后接着沿路线', () => {
    const rows = lure({ 0: attract(5, 8, 1) }, 200);
    expect(rows[29]?.x).toBeCloseTo(6.5, 6);
    expect(rows[119]?.x).toBeCloseTo(8, 9);
    expect(rows[148]).toEqual(rows[125]);
    expect(rows[125]?.x).toBeCloseTo(8, 9);
    expect(rows[199]?.x ?? Number.NaN).toBeLessThan(8);
  });

  test('诱导提前结束时没走完的诱导位移作废，接着沿路线', () => {
    const rows = lure(
      { 0: attract(5, 8, 1), 20: (ctx) => ctx.removeEffect('e', 'attract') },
      40,
    );
    const turned = rows[20]?.x ?? Number.NaN;
    expect(rows[39]?.x ?? Number.NaN).toBeLessThan(turned);
  });

  test('晕眩时诱导位移停下，晕眩结束后接着走', () => {
    const rows = lure(
      {
        0: attract(10, 8, 1),
        1: (ctx) => ctx.applyEffect('e', 'stun', { duration: 1 }),
      },
      60,
    );
    const held = rows[1];
    expect(rows[29]).toEqual(held);
    expect(rows[59]?.x ?? Number.NaN).toBeGreaterThan(held?.x ?? Number.NaN);
  });

  test('抵抗让诱导的时长减半：4 秒的诱导 2 秒就结束', () => {
    const notes: unknown[] = [];
    lure(
      {
        0: (ctx) => {
          ctx.applyEffect('e', 'resist', { duration: 30 });
          attract(4, 8, 1)(ctx);
        },
        58: (ctx) => ctx.hasTag('e', ATTRACT),
        62: (ctx) => ctx.hasTag('e', ATTRACT),
      },
      64,
      'WALK',
      notes,
    );
    expect(notes).toEqual([undefined, true, false]);
  });

  test('飞行单位直线飞向诱导点：(6, 1) 到 (8, 2) 的直线上横向走的是纵向的两倍', () => {
    const rows = lure({ 0: attract(10, 8, 2) }, 30, 'FLY');
    const last = rows[29];
    expect(last?.x ?? Number.NaN).toBeGreaterThan(6);
    expect((last?.x ?? Number.NaN) - 6).toBeCloseTo(
      2 * ((last?.y ?? Number.NaN) - 1),
      6,
    );
  });
});
