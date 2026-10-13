import {
  BOSS,
  createBattle,
  ELITE,
  officialRankModule,
} from 'arknights-mission-core';
import { expect, test } from 'vitest';
import { ally, spec } from '#test/fixture.js';

test('官方等级模块注册 boss 与 elite，规格写上后快照带着；没有模块时规格不能写', () => {
  const units = [
    ally('b', { side: 'enemy', tags: [BOSS.id] }),
    ally('e', { side: 'enemy', x: 1, tags: [ELITE.id] }),
  ];
  const battle = createBattle(spec({ modules: ['official-rank'], units }), [
    officialRankModule,
  ]);
  const tags = Object.fromEntries(
    battle.snapshot().units.map((unit) => [unit.id, unit.tags]),
  );
  expect(tags.b).toContain('boss');
  expect(tags.e).toContain('elite');
  expect(() => createBattle(spec({ units }), [])).toThrow('boss');
});
