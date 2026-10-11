import {
  createBattle,
  type MissionModule,
  NO_HEAL,
  type TileSpec,
} from 'arknights-mission-core';
import { expect, test } from 'vitest';
import { ally, spec } from '#test/fixture.js';

const tiles: readonly TileSpec[] = [8, 9, 10, 11, 12].flatMap((y) =>
  Array.from({ length: 8 }, (_, x) => ({
    x,
    y,
    height: 0,
    deployable: true,
    walkableBy: ['ground'],
  })),
);

const arm: MissionModule = {
  id: 'case',
  install(ctx) {
    ctx.registerSystem({
      id: 'arm',
      slot: 'schedule',
      priority: 1,
      run(runCtx) {
        if (runCtx.tick() === 0) {
          runCtx.startTimer('h', 'attack');
        }
      },
    });
  },
};

type Wall = readonly [x: number, y: number, ratio: number, noHeal?: boolean];

/** 治疗者站在 (2, 10)，三段链、不衰减；给出第一次治疗按顺序治到的人和结束时的生命。 */
function firstChain(walls: Readonly<Record<string, Wall>>) {
  const battle = createBattle(
    spec({
      modules: ['case'],
      tiles: [...tiles],
      units: [
        ally('h', {
          x: 2,
          y: 10,
          attributes: { hp: 1e4, maxHp: 1e4, atk: 100, def: 0, bat: 1 },
          attackRange: [-2, -1, 0, 1, 2].flatMap((y) =>
            [0, 1, 2, 3, 4, 5, 6].map((x) => ({ x, y })),
          ),
          attackShape: { damage: 'heal', chain: { count: 3, falloff: 0 } },
        }),
        ...Object.entries(walls).map(([id, [x, y, ratio, noHeal]], index) =>
          ally(id, {
            x,
            y,
            aggroSeq: index + 1,
            attributes: { hp: 1e4 * ratio, maxHp: 1e4, atk: 0, def: 0 },
            ...(noHeal ? { tags: [NO_HEAL.id] } : {}),
          }),
        ),
      ],
    }),
    [arm],
  );
  battle.drainEvents();
  battle.step();
  const healed = battle
    .drainEvents()
    .flatMap((event) =>
      event.type === 'heal' && event.data.sourceId === 'h'
        ? [event.data.unitId]
        : [],
    );
  const hp = (id: string) =>
    battle.snapshot().units.find((unit) => unit.id === id)?.attributes.hp;
  return { healed, hp };
}

test('跳到上一个人周围 3×3 的格子，不跳到两格外的人；每一跳从落点接着找', () => {
  expect(
    firstChain({ a: [5, 10, 0.5], b: [7, 10, 0.6], c: [6, 11, 0.7] }).healed,
  ).toEqual(['a', 'c', 'b']);
});

test('够得着的人都满血时跳到满血的人身上，白治一下，再从它接着跳', () => {
  const chain = firstChain({ a: [5, 10, 0.5], d: [6, 10, 1], e: [7, 10, 0.6] });
  expect(chain.healed).toEqual(['a', 'd', 'e']);
  expect(chain.hp('d')).toBe(1e4);
  expect(chain.hp('e')).toBe(6100);
});

test('生命比例相同时最晚部署的在前；禁疗的不当主目标也不当跳跃目标', () => {
  expect(
    firstChain({ a: [5, 10, 0.5], f: [5, 9, 0.8], g: [5, 11, 0.8] }).healed,
  ).toEqual(['a', 'g']);
  expect(
    firstChain({ a: [5, 10, 0.5], n: [6, 10, 0.2, true], m: [5, 11, 0.9] })
      .healed,
  ).toEqual(['a', 'm']);
});
