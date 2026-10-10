import { expect, test } from "vitest"
import { costModule, createBattle, type MissionModule } from "arknights-mission-core"
import { spec } from "#test/fixture.js"

function watch(onTick: (tick: number, allyPool: number, enemyPool: number) => void): MissionModule {
  return {
    id: "watch",
    install(ctx) {
      ctx.registerSystem({
        id: "watch",
        slot: "finale",
        priority: 0,
        run(runCtx) {
          onTick(runCtx.tick(), runCtx.costOf("ally"), runCtx.costOf("enemy"))
        },
      })
    },
  }
}

test("费用按阵营回复，加费不超过上限", () => {
  const seen: number[] = []
  const battle = createBattle(
    spec({
      modules: ["cost", "watch"],
      cost: {
        ally: { initial: 10, regen: 30, cap: 12 },
        enemy: { initial: 1, regen: 0, cap: 5 },
      },
    }),
    [
      costModule,
      watch((_tick, allyPool) => {
        seen.push(allyPool)
      }),
    ],
  )
  battle.step()
  battle.step()
  battle.step()
  expect(seen).toEqual([11, 12, 12])
  const added = battle.drainEvents().filter((event) => event.type === "cost")
  expect(added.map((event) => event.data)).toEqual([
    { side: "ally", value: 11 },
    { side: "ally", value: 12 },
  ])
})

test("扣费不够时不动，够了才减，两个阵营分开", () => {
  let allyPool = -1
  let enemyPool = -1
  let paid = false
  let refused = true
  const gate: MissionModule = {
    id: "watch",
    install(ctx) {
      ctx.registerSystem({
        id: "pay",
        slot: "schedule",
        priority: 0,
        run(runCtx) {
          refused = runCtx.spendCost("ally", 8)
          paid = runCtx.spendCost("ally", 3)
          runCtx.addCost("enemy", 4)
          runCtx.addCost("ally", 100)
          allyPool = runCtx.costOf("ally")
          enemyPool = runCtx.costOf("enemy")
        },
      })
    },
  }
  const battle = createBattle(
    spec({
      modules: ["watch"],
      cost: {
        ally: { initial: 5, regen: 0, cap: 9 },
        enemy: { initial: 0, regen: 0, cap: 4 },
      },
    }),
    [gate],
  )
  battle.step()
  expect(refused).toBe(false)
  expect(paid).toBe(true)
  expect(allyPool).toBe(9)
  expect(enemyPool).toBe(4)
  expect(battle.drainEvents().filter((event) => event.type === "cost").map((event) => event.data)).toEqual([
    { side: "ally", value: 2 },
    { side: "enemy", value: 4 },
    { side: "ally", value: 9 },
  ])
})
