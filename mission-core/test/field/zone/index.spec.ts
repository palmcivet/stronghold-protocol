import {
  createBattle,
  defineTag,
  defineZone,
  type TileSpec,
} from 'arknights-mission-core';
import { expect, test } from 'vitest';
import { ally, spec } from '#test/fixture.js';

const PULSE = defineTag('test-pulse', { meaning: 'emits the test zone' });

function tile(x: number, y: number): TileSpec {
  return { x, y, height: 0, deployable: true, walkableBy: ['ground'] };
}

test('作用区按装置的攻击范围与朝向圈格子；晚入场的装置算数；装置离场时离开', () => {
  const log: string[] = [];
  const battle = createBattle(
    spec({
      modules: ['zone'],
      tiles: [tile(0, 0), tile(1, 0), tile(2, 0)],
      units: [
        ally('a', {
          kind: 'device',
          tags: ['test-pulse'],
          x: 1,
          y: 0,
          facing: 'LEFT',
        }),
        ally('b', {
          kind: 'device',
          tags: ['test-pulse'],
          x: 2,
          y: 0,
          facing: 'LEFT',
          attackRange: [{ x: 2, y: 0 }],
        }),
        ally('u', { side: 'enemy', x: 0, y: 0 }),
      ],
    }),
    [
      {
        id: 'zone',
        install(ctx) {
          ctx.registerTag(PULSE);
          ctx.registerZone(
            defineZone('pulse', {
              source: PULSE,
              onStay: (unitId, _ctx, visit) =>
                void log.push(
                  `${unitId} ${visit.deviceId} ${visit.facing} ${visit.moved ? 'moved' : 'new'}`,
                ),
              onLeave: (unitId) => void log.push(`leave ${unitId}`),
            }),
          );
          ctx.registerSystem({
            id: 'zone-remove',
            slot: 'finale',
            priority: 0,
            run(run) {
              if (run.tick() === 1) {
                run.removeUnit('b');
              }
              if (run.tick() === 2) {
                run.removeUnit('a');
              }
            },
          });
        },
      },
    ],
  );
  for (let index = 0; index < 4; index += 1) {
    battle.step();
  }
  expect(log).toEqual([
    'u b LEFT new',
    'u b LEFT moved',
    'u a LEFT moved',
    'leave u',
  ]);
});
