import { expect, test } from "vitest"
import { STUN } from "#port/tag.js"
import { createBattle, type MissionModule, type StatusDefinition } from "arknights-mission-core"
import { ally, spec } from "#test/fixture.js"

const stun: StatusDefinition = {
  id: "stun",
  tags: [STUN],
  modifiers: [],
  immunity: [],
  stackCap: 1,
  cancels: ["attack"],
  duration: 0,
}

test("取消前摇后命中不发生", () => {
  const hits: string[] = []
  const module: MissionModule = {
    id: "stun",
    install(ctx) {
      ctx.registerStatus(stun)
      ctx.subscribe("attack-hit", () => {
        hits.push("hit")
      })
      ctx.registerSystem({
        id: "arm",
        slot: "schedule",
        priority: 1,
        run(runCtx) {
          runCtx.startTimer("a", "attack")
        },
      })
      ctx.registerSystem({
        id: "apply",
        slot: "status",
        priority: -1,
        run(runCtx) {
          runCtx.applyStatus("a", "stun")
        },
      })
    },
  }
  const battle = createBattle(spec({ modules: ["stun"], units: [ally("a")] }), [module])
  battle.step()
  battle.step()
  battle.step()
  expect(hits).toEqual([])
  expect(battle.snapshot().units[0]?.tags).toContain("stun")
})

test("没有取消时前摇结束后命中", () => {
  const hits: string[] = []
  const module: MissionModule = {
    id: "arm",
    install(ctx) {
      ctx.subscribe("attack-hit", () => {
        hits.push("hit")
      })
      ctx.registerSystem({
        id: "arm",
        slot: "schedule",
        priority: 1,
        run(runCtx) {
          runCtx.startTimer("a", "attack")
        },
      })
    },
  }
  const battle = createBattle(
    spec({ modules: ["arm"], units: [ally("a"), ally("foe", { side: "enemy", x: 1, y: 0 })] }),
    [module],
  )
  battle.step()
  battle.step()
  battle.step()
  expect(hits).toEqual(["hit"])
})
