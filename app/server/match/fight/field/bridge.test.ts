import { describe, expect, test } from "vitest"
import { FieldBattle } from "#server/match/fight/field/index.js"

describe("field battle", () => {
  test("boss hits are credited to the shared pool", () => {
    const calls: number[] = []
    const pool = {
      maxHp: 500,
      hp: 500,
      byPlayer: {} as Record<string, number>,
      damage(playerId: string | null, amount: number) {
        const dealt = Math.min(this.hp, amount)
        this.hp -= dealt
        if (playerId) this.byPlayer[playerId] = (this.byPlayer[playerId] ?? 0) + dealt
        calls.push(dealt)
        return dealt
      },
    }
    const battle = new FieldBattle({
      seed: 1,
      kind: "boss",
      rect: { r0: 0, r1: 5, c0: 0, c1: 12 },
      timeLimit: 30,
      players: [{
        playerId: "p_0",
        units: [{ uid: 1, kind: "chess", chessId: "chess_char_1_02_a", row: 2, col: 2, dir: "RIGHT" }],
      }],
      spawns: [{ enemyKey: "enemy_1007_zombie_a", tag: "boss", time: 0, count: 1, routeIndex: 0, countInTotal: true }],
      routes: [{ motion: "WALK", start: [2, 3], end: [2, 2], checkpoints: [] }],
      sharedBoss: pool,
      data: {
        chess: {
          chess_char_1_02_a: { position: "MELEE", rangeGrid: [[0, 0], [0, 1]], stats: { maxHp: 5000, atk: 500, def: 0, res: 0, bat: 0.5, aspd: 100, blockCnt: 1, moveSpeed: 1 } },
        },
        enemies: {
          enemy_1007_zombie_a: { stats: { maxHp: 500, atk: 0, def: 0, res: 0, moveSpeed: 0, aspd: 100, blockCnt: 0, motion: "WALK" } },
        },
      },
    })
    for (let step = 0; step < 90 && pool.hp > 0; step += 1) battle.step()
    expect(battle.errors.map((error: Error) => error.message).join("\n")).toBe("")
    expect(calls.length).toBeGreaterThan(0)
    expect(pool.hp).toBeLessThan(500)
    const row = battle.result().perPlayer.p_0
    expect(row.total).toBe(1)
    expect(row.damageDealt).toBeGreaterThan(0)
    expect(row.bossDamage).toBeGreaterThan(0)
    expect(row.killed).toBeGreaterThan(0)
  })

  test("an enemy that reaches the route end is a counted leak on that player's result", () => {
    const battle = new FieldBattle({
      seed: 2,
      kind: "normal",
      rect: { r0: 9, r1: 12, c0: 0, c1: 10 },
      timeLimit: 30,
      players: [{ playerId: "p_0", units: [] }],
      spawns: [{ enemyKey: "enemy_1005_yokai", time: 0, count: 1, routeIndex: 0, countInTotal: true }],
      routes: [{ motion: "WALK", start: [9, 2], end: [9, 3], checkpoints: [] }],
      data: {
        enemies: {
          enemy_1005_yokai: { lifePointReduce: 1, stats: { maxHp: 100, atk: 0, def: 0, res: 0, moveSpeed: 10, aspd: 100, blockCnt: 0, motion: "WALK" } },
        },
      },
    })
    for (let step = 0; step < 120 && (battle.result().perPlayer.p_0.leaked.length === 0); step += 1) battle.step()
    const row = battle.result().perPlayer.p_0
    expect(battle.errors.map((error: Error) => error.message).join("\n")).toBe("")
    expect(row.total).toBe(1)
    expect(row.leaked).toEqual([{ enemyKey: "enemy_1005_yokai", sourcePlayerId: "p_0", counted: true, lpr: 1 }])
    expect(row.perfect).toBe(false)
    expect(row.killed).toBe(0)
  })
})
