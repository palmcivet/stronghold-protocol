import {
  type ContentContext,
  createBattle,
  type MissionModule,
  type UnitSpec,
} from 'arknights-mission-core';
import { expect, test } from 'vitest';
import { ally, spec } from '#test/fixture.js';

function open(
  units: UnitSpec[],
  run: (ctx: ContentContext) => void,
  prepare?: MissionModule['install'],
) {
  const module: MissionModule = {
    id: 'case',
    install(ctx) {
      prepare?.(ctx);
      ctx.registerSystem({
        id: 'case',
        slot: 'schedule',
        priority: 1,
        run(runCtx) {
          if (runCtx.tick() === 0) {
            run(runCtx);
          }
        },
      });
    },
  };
  return createBattle(spec({ modules: ['case'], units }), [module]);
}

function swing(ctx: ContentContext, unitId: string): void {
  ctx.startTimer(unitId, 'attack');
  for (let step = 0; step < 80; step += 1) {
    const before = String(ctx.timerView(unitId, 'attack').phase);
    ctx.advanceTimer(unitId, 'attack');
    if (!ctx.timerView(unitId, 'attack').started) {
      return;
    }
    const after = String(ctx.timerView(unitId, 'attack').phase);
    if (after === 'recovery' && before !== 'recovery') {
      return;
    }
  }
}

const field = (): UnitSpec[] => [
  ally('e', {
    side: 'enemy',
    x: 0,
    y: 0,
    facing: 'RIGHT',
    attributes: { hp: 100 },
  }),
  ally('a', { x: 1, y: 0, facing: 'LEFT', attributes: { hp: 500 } }),
];

test('palsy-interrupt 每次打断发一次，带用掉之前的层数；没有麻痹不发', () => {
  const seen: [string, number][] = [];
  const hits: string[] = [];
  const battle = open(field(), (ctx) => {
    ctx.subscribe('palsy-interrupt', (event) => {
      seen.push([event.data.unitId, event.data.stacks]);
    });
    ctx.subscribe('attack-hit', (event) => {
      hits.push(event.data.unitId);
    });
    swing(ctx, 'e');
    ctx.applyEffect('e', 'palsy', { value: 2 });
    swing(ctx, 'e');
    swing(ctx, 'e');
    swing(ctx, 'e');
  });
  battle.step();
  expect(seen).toEqual([
    ['e', 2],
    ['e', 1],
  ]);
  expect(hits).toEqual(['e', 'e']);
  expect(
    battle.snapshot().units.find((unit) => unit.id === 'e')?.tags,
  ).not.toContain('palsy');
});

test('订阅者把 keep 改成 true 时这一层留着，普攻仍被打断；订阅者击倒敌人时这次普攻结束', () => {
  const hits: string[] = [];
  const seen: number[] = [];
  let keepNext = true;
  const kept = open(field(), (ctx) => {
    ctx.subscribe('palsy-interrupt', (event) => {
      seen.push(event.data.stacks);
      if (keepNext) {
        ctx.revise(event, { keep: true });
      }
      keepNext = false;
    });
    ctx.subscribe('attack-hit', (event) => {
      hits.push(event.data.unitId);
    });
    ctx.applyEffect('e', 'palsy', { value: 1 });
    swing(ctx, 'e');
    swing(ctx, 'e');
    swing(ctx, 'e');
  });
  kept.step();
  expect(seen).toEqual([1, 1]);
  expect(hits).toEqual(['e']);

  const lethal = open(field(), (ctx) => {
    ctx.subscribe('palsy-interrupt', (event) => {
      ctx.loseHp(event.data.unitId, 1000);
    });
    ctx.applyEffect('e', 'palsy', { value: 3 });
    swing(ctx, 'e');
  });
  lethal.step();
  const enemy = lethal.snapshot().units.find((unit) => unit.id === 'e');
  expect(enemy === undefined || enemy.downed).toBe(true);
  const events = lethal.drainEvents().map((event) => event.type);
  expect(events.filter((type) => type === 'palsy-interrupt')).toHaveLength(1);
  expect(events).not.toContain('attack-hit');
});
