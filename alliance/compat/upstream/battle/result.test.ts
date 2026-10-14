import { isBattleResult } from '@alliance/contract/message.js';
import {
  type BattleSpec,
  blockModule,
  costModule,
  createBattle,
  deployModule,
  leakModule,
} from 'arknights-mission-core';
import { describe, expect, it } from 'vitest';
import { battleResultOf, playerIdsOfSpec } from './result.js';

function tinySpec(owners: readonly string[]): BattleSpec {
  return {
    seed: 1,
    modules: ['cost', 'deploy', 'block', 'leak'],
    tiles: [
      { x: 0, y: 0, height: 0, deployable: true, walkableBy: ['ground'] },
      { x: 1, y: 0, height: 0, deployable: true, walkableBy: ['ground'] },
    ],
    units: owners.map((owner, index) => ({
      id: `op:${index}`,
      side: 'ally' as const,
      kind: 'operator' as const,
      owner,
      attributes: {
        hp: 100,
        atk: 10,
        def: 0,
        res: 0,
        atkInterval: 1,
        attackSpeed: 100,
        moveSpeed: 1,
        block: 1,
      },
      skills: [],
      attackRange: [{ x: 1, y: 0 }],
      tags: [],
      deployPositions: ['ground'],
      x: index,
      y: 0,
      facing: 'RIGHT' as const,
      motion: 'WALK' as const,
      attackShape: { damage: 'physical' as const },
    })),
    spawns: [],
    deployStrategy: null,
    cost: {
      ally: { initial: 10, regen: 1, cap: 99 },
      enemy: { initial: 0, regen: 0, cap: 0 },
    },
  };
}

describe('battleResultOf', () => {
  it('fills perPlayer from start player ids and passes the contract check', () => {
    const battle = createBattle(tinySpec(['p_1']), [
      costModule,
      deployModule,
      blockModule,
      leakModule,
    ]);
    // Finish with no enemies: ally wins after enough ticks with empty spawn list?
    // Empty battle may not finish — force by reading unfinished shape still has perPlayer.
    const result = battleResultOf(battle, { playerIds: ['p_1'] });
    expect(result.perPlayer).toHaveProperty('p_1');
    expect(result.reason).toMatch(/cleared|timeout|forced/);
    const player = (result.perPlayer as Record<string, Record<string, unknown>>)
      .p_1!;
    expect(player).toMatchObject({
      leaked: [],
      layerGains: {},
      unitsEnd: expect.any(Array),
    });
    expect(typeof player.killed).toBe('number');
    expect(typeof player.total).toBe('number');
    expect(isBattleResult(result)).toBe(true);
  });

  it('reads player ids from a master start spec', () => {
    expect(
      playerIdsOfSpec({
        players: [{ playerId: 'a' }, { playerId: 'b' }, { nope: true }],
      }),
    ).toEqual(['a', 'b']);
  });
});
