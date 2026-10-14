import { describe, expect, it } from 'vitest';
import { combatDefsOf } from './combat-def.js';

describe('combat defs', () => {
  it('reads chess and enemy combat stats from master tables', () => {
    const defs = combatDefsOf(
      {
        chess_a: {
          chessId: 'chess_a',
          charId: 'char_1',
          profession: 'SNIPER',
          dmgType: 'phys',
          rangeGrid: [[1, 0], [2, 0]],
          stats: { maxHp: 100, atk: 20, def: 5, res: 0, bat: 1, aspd: 100, moveSpeed: 1, blockCnt: 1 },
          skill: {
            skillId: 'sk_a',
            skillType: 'MANUAL',
            durationType: 'NONE',
            duration: 10,
            spType: 'INCREASE_WITH_TIME',
            spCost: 20,
            initSp: 5,
            bb: { atk: 0.5 },
            trigger: { rule: 'DEFAULT' },
          },
        },
      },
      {
        enemy_1: {
          key: 'enemy_1',
          stats: {
            maxHp: 200,
            atk: 30,
            def: 0,
            res: 10,
            bat: 1.5,
            aspd: 100,
            moveSpeed: 1.2,
            blockCnt: 1,
            rangeRadius: 0,
            motion: 'WALK',
            dmgType: 'phys',
          },
        },
      },
    );
    expect(defs.chess.chess_a?.stats.maxHp).toBe(100);
    expect(defs.chess.chess_a?.rangeGrid).toEqual([[1, 0], [2, 0]]);
    expect(defs.chess.chess_a?.attackRange).toEqual([[1, 0], [2, 0]]);
    expect(defs.chess.chess_a?.profession).toBe('SNIPER');
    expect(defs.chess.chess_a?.skill?.skillId).toBe('sk_a');
    expect(defs.enemies.enemy_1?.stats.atk).toBe(30);
    expect(defs.enemies.enemy_1?.attackRange).toEqual([[1, 0]]);
  });

  it('normalizes attackRange / attackClip / attack-moves from enemy records', () => {
    const defs = combatDefsOf(
      {},
      {
        walker: {
          key: 'walker',
          stats: {
            maxHp: 10,
            atk: 1,
            def: 0,
            res: 0,
            bat: 1,
            aspd: 100,
            moveSpeed: 1,
            blockCnt: 1,
            rangeRadius: 0,
            motion: 'WALK',
            dmgType: 'phys',
          },
          attackMoves: true,
          attackClip: { duration: 0.8, hit: 0.3 },
        },
      },
    );
    expect(defs.enemies.walker?.tags).toContain('attack-moves');
    expect(defs.enemies.walker?.attackClip).toEqual({ duration: 0.8, hit: 0.3 });
  });
});
