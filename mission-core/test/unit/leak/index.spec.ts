import { expect, test } from "vitest"
import { createBattle, leakModule, type MissionModule, type TileSpec } from "arknights-mission-core"
import { ally, spec } from "#test/fixture.js"

function ground(x: number, objective = false): TileSpec {
  return { x, y: 0, height: 0, deployable: true, walkableBy: ["ground"], ...(objective ? { objective: true } : {}) }
}

function watch(seen: string[][]): MissionModule {
  return {
    id: "watch",
    install(ctx) {
      ctx.registerSystem({
        id: "watch",
        slot: "finale",
        priority: 0,
        run(runCtx) {
          seen.push([...runCtx.unitsInRange("guard", "enemy")])
        },
      })
    },
  }
}

test("敌人走到保护目标上就离场并发泄漏，不判胜负", () => {
  const seen: string[][] = []
  const battle = createBattle(
    spec({
      modules: ["leak", "watch"],
      tiles: [ground(0), ground(1, true)],
      units: [
        ally("guard", { attackRange: [{ x: 1, y: 0 }] }),
        ally("runner", {
          side: "enemy",
          attributes: { hp: 100, moveSpeed: 60 },
          route: { checkpoints: [], end: { x: 1, y: 0 } },
        }),
      ],
    }),
    [leakModule, watch(seen)],
  )
  battle.step()
  expect(seen).toEqual([[]])
  expect(battle.snapshot().units.find((unit) => unit.id === "runner")).toMatchObject({ x: 1, y: 0 })
  expect(battle.drainEvents().filter((event) => event.type === "leak").map((event) => event.data)).toEqual([
    { unitId: "runner" },
  ])
  expect(battle.result()).toEqual({ finished: false, winner: null })
  battle.step()
  expect(battle.drainEvents().some((event) => event.type === "leak")).toBe(false)
})

test("终点不是保护目标时只停住，不泄漏", () => {
  const seen: string[][] = []
  const battle = createBattle(
    spec({
      modules: ["leak", "watch"],
      tiles: [ground(0), ground(1)],
      units: [
        ally("guard", { attackRange: [{ x: 1, y: 0 }] }),
        ally("runner", {
          side: "enemy",
          attributes: { hp: 100, moveSpeed: 60 },
          route: { checkpoints: [], end: { x: 1, y: 0 } },
        }),
      ],
    }),
    [leakModule, watch(seen)],
  )
  battle.step()
  expect(seen).toEqual([["runner"]])
  battle.step()
  expect(battle.snapshot().units.find((unit) => unit.id === "runner")).toMatchObject({ x: 1, y: 0 })
  expect(battle.drainEvents().some((event) => event.type === "leak")).toBe(false)
  expect(battle.result()).toEqual({ finished: false, winner: null })
})
