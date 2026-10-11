import {
  type ContentContext,
  createBattle,
  type MissionModule,
  PULL_CRAWL,
  PULL_STOP_RADIUS,
  PULL_WEAK_SHARE,
  PUSH_TILES,
  PUSH_TILES_EFFECT,
  SHIFT_PULL,
  SHIFT_PUSH,
  type ShiftInput,
} from 'arknights-mission-core';
import { describe, expect, test } from 'vitest';
import { ally, spec } from '#test/fixture.js';

const field = Array.from({ length: 16 }, (_, x) =>
  [0, 1, 2, 3, 4].map((y) => ({
    x,
    y,
    height: 0,
    deployable: true,
    walkableBy: ['ground'],
  })),
).flat();

/** 重量 mass 的敌人站在 (2, 2)，第 0 拍执行一次位移，返回位移后的坐标与 shift 的返回值。 */
function shove(
  action: string,
  input: ShiftInput,
  mass = 0,
  extra: (ctx: ContentContext) => void = () => {},
) {
  let moved: boolean | null = null;
  const module: MissionModule = {
    id: 'case',
    install(ctx) {
      ctx.registerSystem({
        id: 'shove',
        slot: 'schedule',
        priority: 0,
        run(runCtx) {
          if (runCtx.tick() !== 0) {
            return;
          }
          extra(runCtx);
          moved = runCtx.shift(action, 'e', input);
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
          x: 2,
          y: 2,
          attackRange: [],
          attributes: { hp: 100, moveSpeed: 0, massLevel: mass },
        }),
      ],
    }),
    [module],
  );
  battle.step();
  const unit = battle.snapshot().units.find((item) => item.id === 'e');
  if (!unit) {
    throw new Error('no e');
  }
  return { x: unit.x, y: unit.y, moved };
}

describe('推与拉', () => {
  test('推力表：受力等级 = 力度 − 重量，−2 到 3 依次 0.12、0.44、1.7、2.14、2.96、3.53 格，≥ 3 按 3，≤ −3 不动', () => {
    for (const level of [-2, -1, 0, 1, 2, 3]) {
      const { x } = shove(
        SHIFT_PUSH,
        { force: level + 2, fromX: 1, fromY: 2 },
        2,
      );
      expect(x - 2).toBeCloseTo(PUSH_TILES[level] ?? Number.NaN, 6);
    }
    expect(
      shove(SHIFT_PUSH, { force: 6, fromX: 1, fromY: 2 }, 0).x - 2,
    ).toBeCloseTo(PUSH_TILES[3] ?? Number.NaN, 6);
    expect(
      shove(SHIFT_PUSH, { force: 0, fromX: 1, fromY: 2 }, 3),
    ).toMatchObject({ x: 2, moved: false });
  });

  test('特效推用特效列，少一帧的行程', () => {
    expect(
      shove(SHIFT_PUSH, { force: 1, fromX: 1, fromY: 2, effect: true }).x - 2,
    ).toBeCloseTo(PUSH_TILES_EFFECT[1] ?? Number.NaN, 6);
  });

  test('定向推：偏离方向超过 45° 或离起点近于 0.25 格时改成径向，受力等级减 2；fixed 两项都免，fixedAngle 只免夹角', () => {
    const along = shove(SHIFT_PUSH, {
      force: 2,
      fromX: 1,
      fromY: 2,
      dirX: 1,
      dirY: 0,
    });
    expect(along.x - 2).toBeCloseTo(PUSH_TILES[2] ?? Number.NaN, 6);
    const off = shove(SHIFT_PUSH, {
      force: 2,
      fromX: 2,
      fromY: 1,
      dirX: 1,
      dirY: 0,
    });
    expect(off.x).toBeCloseTo(2, 6);
    expect(off.y - 2).toBeCloseTo(PUSH_TILES[0] ?? Number.NaN, 6);
    const near = shove(SHIFT_PUSH, {
      force: 2,
      fromX: 1.9,
      fromY: 2,
      dirX: 1,
      dirY: 0,
    });
    expect(near.x - 2).toBeCloseTo(PUSH_TILES[0] ?? Number.NaN, 6);
    const fixed = shove(SHIFT_PUSH, {
      force: 2,
      fromX: 2,
      fromY: 1.9,
      dirX: 1,
      dirY: 0,
      fixed: true,
    });
    expect(fixed.x - 2).toBeCloseTo(PUSH_TILES[2] ?? Number.NaN, 6);
    const angle = shove(SHIFT_PUSH, {
      force: 2,
      fromX: 2,
      fromY: 1,
      dirX: 1,
      dirY: 0,
      fixedAngle: true,
    });
    expect(angle.x - 2).toBeCloseTo(PUSH_TILES[2] ?? Number.NaN, 6);
    const angleNear = shove(SHIFT_PUSH, {
      force: 2,
      fromX: 1.9,
      fromY: 2,
      dirX: 1,
      dirY: 0,
      fixedAngle: true,
    });
    expect(angleNear.x - 2).toBeCloseTo(PUSH_TILES[0] ?? Number.NaN, 6);
    const free = shove(SHIFT_PUSH, { force: 2, dirX: 1, dirY: 0 });
    expect(free.x - 2).toBeCloseTo(PUSH_TILES[2] ?? Number.NaN, 6);
  });

  test('拉：受力等级 ≥ 0 拉到急停圈，−1 走起点距离的 35%，−2 走 0.03 格，≤ −3 不动', () => {
    expect(shove(SHIFT_PULL, { force: 1, toX: 10, toY: 2 }, 1).x).toBeCloseTo(
      10 - PULL_STOP_RADIUS,
      6,
    );
    expect(
      shove(SHIFT_PULL, { force: 0, toX: 10, toY: 2 }, 1).x - 2,
    ).toBeCloseTo(PULL_WEAK_SHARE * 8, 6);
    expect(
      shove(SHIFT_PULL, { force: 0, toX: 10, toY: 2 }, 2).x - 2,
    ).toBeCloseTo(PULL_CRAWL, 6);
    expect(shove(SHIFT_PULL, { force: 0, toX: 10, toY: 2 }, 3)).toMatchObject({
      x: 2,
      moved: false,
    });
  });
});
