import { expect, test } from "vitest"
import { createBattle, type MissionModule } from "arknights-mission-core"
import { ally, spec } from "#test/fixture.js"

test("开战和击倒调用已注册的部署策略", () => {
  const calls: string[] = []
  const strategy: MissionModule = {
    id: "manual",
    install(ctx) {
      ctx.registerDeployStrategy({
        id: "manual",
        opening() {
          calls.push("opening")
          return ["a"]
        },
        downedTile() {
          calls.push("downed")
          return { x: 2, y: 3 }
        },
        canStand() {
          calls.push("stand")
          return false
        },
      })
      ctx.registerSystem({
        id: "hit",
        slot: "schedule",
        priority: 1,
        run(runCtx) {
          runCtx.dealDamage({ sourceId: "a", targetId: "a", amount: 100, kind: "physical" })
        },
      })
    },
  }
  const battle = createBattle(
    spec({
      modules: ["manual"],
      deployStrategy: "manual",
      units: [ally("a"), ally("b", { x: 1 })],
    }),
    [strategy],
  )
  expect(calls).toEqual(["opening"])
  expect(battle.drainEvents().filter((event) => event.type === "deploy").map((event) => event.data.unitId)).toEqual(["a"])
  battle.step()
  expect(calls).toEqual(["opening", "downed", "stand"])
  const downed = battle.drainEvents().find((event) => event.type === "downed")
  expect(downed?.data).toEqual({ unitId: "a", x: 2, y: 3, canStand: false })
  expect(battle.snapshot().units.find((unit) => unit.id === "a")).toMatchObject({ x: 2, y: 3 })
})
