import {
  createBattle,
  DEPLOY_STRATEGY,
  deployModule,
  type MissionModule,
  SHIFT_FEAR,
  SHIFT_PULL,
  SHIFT_PUSH,
} from 'arknights-mission-core';
import { expect, test } from 'vitest';
import { ally, spec } from '#test/fixture.js';

const lane = [0, 1, 2, 3, 4, 5].map((x) => ({
  x,
  y: 0,
  height: 0,
  deployable: true,
  walkableBy: ['ground'],
}));

function hit(
  run: (ctx: {
    shift(
      actionId: string,
      unitId: string,
      input?: {
        force?: number;
        fromX?: number;
        fromY?: number;
        toX?: number;
        toY?: number;
        centerX?: number;
        centerY?: number;
        pullerId?: string;
        sourceX?: number;
        sourceY?: number;
      },
    ): boolean;
    dealDamage(info: {
      sourceId: string;
      targetId: string;
      amount: number;
      kind: 'true';
    }): void;
  }) => void,
): MissionModule {
  return {
    id: 'hit',
    install(ctx) {
      ctx.registerSystem({
        id: 'hit',
        slot: 'schedule',
        priority: 0,
        run(runCtx) {
          if (runCtx.tick() !== 0) {
            return;
          }
          run(runCtx);
        },
      });
    },
  };
}

test('推力按受力等级写到落点，倒地读这个坐标', () => {
  const battle = createBattle(
    spec({
      modules: [DEPLOY_STRATEGY, 'hit'],
      deployStrategy: DEPLOY_STRATEGY,
      tiles: lane,
      units: [
        ally('a'),
        ally('e', {
          side: 'enemy',
          attributes: { hp: 10, massLevel: 0, moveSpeed: 0 },
        }),
      ],
    }),
    [
      deployModule,
      hit((ctx) => {
        expect(
          ctx.shift(SHIFT_PUSH, 'e', { force: 1, fromX: -1, fromY: 0 }),
        ).toBe(true);
        ctx.dealDamage({
          sourceId: 'a',
          targetId: 'e',
          amount: 50,
          kind: 'true',
        });
      }),
    ],
  );
  battle.step();
  const events = battle.drainEvents();
  const moved = events.find((event) => event.type === 'displace');
  expect(moved?.data.x).toBeCloseTo(2.14, 2);
  const downed = events.find((event) => event.type === 'downed');
  expect(downed?.data.x).toBe(2);
  expect(downed?.data.y).toBe(0);
});

test('拉力在受力等级不小于 0 时拉到急停圈', () => {
  const battle = createBattle(
    spec({
      modules: ['hit'],
      tiles: lane,
      units: [
        ally('e', {
          side: 'enemy',
          x: 4,
          attributes: { hp: 10, massLevel: 1, moveSpeed: 0 },
        }),
      ],
    }),
    [
      hit((ctx) => {
        ctx.shift(SHIFT_PULL, 'e', { force: 1, toX: 0, toY: 0 });
      }),
    ],
  );
  battle.step();
  const moved = battle.snapshot().units.find((unit) => unit.id === 'e');
  expect(moved?.x).toBeGreaterThan(0.5);
  expect(moved?.x).toBeLessThan(1);
});

function pulled(input: {
  toX?: number;
  toY?: number;
  centerX?: number;
  centerY?: number;
  pullerId?: string;
}) {
  const battle = createBattle(
    spec({
      modules: ['hit'],
      tiles: lane,
      units: [
        ally('p', { x: 1, facing: 'RIGHT' }),
        ally('e', {
          side: 'enemy',
          x: 4,
          attributes: { hp: 10, massLevel: 1, moveSpeed: 0 },
        }),
      ],
    }),
    [
      hit((ctx) => {
        ctx.shift(SHIFT_PULL, 'e', { force: 1, ...input });
      }),
    ],
  );
  battle.step();
  return battle.snapshot().units.find((unit) => unit.id === 'e');
}

test('拉到单位面前时终点在它前方半格，急停围绕它', () => {
  const front = pulled({ pullerId: 'p' });
  const explicit = pulled({ toX: 1.5, toY: 0, centerX: 1, centerY: 0 });
  expect(front?.x).toBe(explicit?.x);
  expect(front?.y).toBe(explicit?.y);
  expect(front?.x).toBeGreaterThan(1.5);
  expect(front?.x).toBeLessThan(2);
});

test('拉向不存在的单位不发生位移', () => {
  expect(pulled({ pullerId: 'nobody' })?.x).toBe(4);
});

test('恐惧沿扇形走，倒地时先落到计划终点', () => {
  const battle = createBattle(
    spec({
      seed: 1,
      modules: [DEPLOY_STRATEGY, 'hit'],
      deployStrategy: DEPLOY_STRATEGY,
      tiles: [
        ...lane,
        ...[0, 1, 2, 3, 4, 5].map((x) => ({
          x,
          y: 1,
          height: 0,
          deployable: true,
          walkableBy: ['ground'],
        })),
      ],
      units: [
        ally('e', {
          side: 'enemy',
          x: 2,
          y: 1,
          attributes: { hp: 10, moveSpeed: 1 },
        }),
      ],
    }),
    [
      deployModule,
      hit((ctx) => {
        expect(ctx.shift(SHIFT_FEAR, 'e', { sourceX: 0, sourceY: 1 })).toBe(
          true,
        );
        ctx.dealDamage({
          sourceId: 'e',
          targetId: 'e',
          amount: 50,
          kind: 'true',
        });
      }),
    ],
  );
  battle.step();
  const downed = battle.drainEvents().find((event) => event.type === 'downed');
  expect(downed?.data.x).not.toBe(2);
});

test('displace 带位移时长与是否保持朝向：推的时长是失衡秒数（受力等级 1 是 0.9 秒），直接移动是 0；推拉保持朝向，显式关掉或直接移动不保持', () => {
  const battle = createBattle(
    spec({
      modules: [DEPLOY_STRATEGY, 'move'],
      deployStrategy: DEPLOY_STRATEGY,
      tiles: lane,
      units: [
        ally('a'),
        ally('e', {
          side: 'enemy',
          attributes: { hp: 100, massLevel: 0, moveSpeed: 0 },
        }),
        ally('f', {
          side: 'enemy',
          x: 3,
          attributes: { hp: 100, massLevel: 0, moveSpeed: 0 },
        }),
      ],
    }),
    [
      deployModule,
      {
        id: 'move',
        install(ctx) {
          ctx.registerSystem({
            id: 'move',
            slot: 'schedule',
            priority: 0,
            run(runCtx) {
              if (runCtx.tick() !== 0) {
                return;
              }
              runCtx.shift(SHIFT_PUSH, 'e', { force: 1, fromX: -1, fromY: 0 });
              runCtx.shift(SHIFT_PUSH, 'f', {
                force: 1,
                fromX: 2,
                fromY: 0,
                keepFacing: false,
              });
              runCtx.displace('a', 1, 0);
            },
          });
        },
      },
    ],
  );
  battle.step();
  const moves = battle
    .drainEvents()
    .filter((event) => event.type === 'displace')
    .map((event) =>
      event.type === 'displace'
        ? [event.data.unitId, event.data.duration, event.data.keepFacing]
        : [],
    );
  expect(moves).toEqual([
    ['e', 0.9, true],
    ['f', 0.9, false],
    ['a', 0, false],
  ]);
});

test('受力等级读修饰之后的重量：重量 4 挨中力不动，减 1 后按 −2 推 0.12 格；重量不低于 0，基础值不变', () => {
  const moved: number[] = [];
  const read: number[] = [];
  const module: MissionModule = {
    id: 'mass',
    install(ctx) {
      ctx.registerSystem({
        id: 'mass',
        slot: 'schedule',
        priority: 0,
        run(runCtx) {
          if (runCtx.tick() !== 0) {
            return;
          }
          runCtx.shift(SHIFT_PUSH, 'e', { force: 1, fromX: -1, fromY: 0 });
          runCtx.setModifier('e', 'weightless', [
            { attribute: 'massLevel', op: 'add', value: -1 },
          ]);
          read.push(runCtx.attribute('e', 'massLevel'));
          runCtx.shift(SHIFT_PUSH, 'e', { force: 1, fromX: -1, fromY: 0 });
          runCtx.setModifier('e', 'feather', [
            { attribute: 'massLevel', op: 'add', value: -10 },
          ]);
          read.push(runCtx.attribute('e', 'massLevel'));
          runCtx.clearModifier('e', 'weightless');
          runCtx.clearModifier('e', 'feather');
          read.push(runCtx.attribute('e', 'massLevel'));
        },
      });
      ctx.subscribe('displace', (event) => {
        moved.push(event.data.x);
      });
    },
  };
  const battle = createBattle(
    spec({
      modules: ['mass'],
      tiles: lane,
      units: [
        ally('e', {
          side: 'enemy',
          x: 1,
          attributes: { hp: 10, massLevel: 4, moveSpeed: 0 },
        }),
      ],
    }),
    [module],
  );
  battle.step();
  battle.drainEvents();
  expect(moved).toHaveLength(1);
  expect(moved[0]).toBeCloseTo(1.12, 6);
  expect(read).toEqual([3, 0, 4]);
});
