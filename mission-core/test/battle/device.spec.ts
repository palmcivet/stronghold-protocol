import { expect, test } from "vitest"
import { createBattle, type ContentContext, type MissionModule } from "arknights-mission-core"
import { ally, spec } from "#test/fixture.js"

function script(at: number, act: (ctx: ContentContext) => void): MissionModule {
  return {
    id: `script-${at}`,
    install(ctx) {
      ctx.registerSystem({
        id: `script-${at}`,
        slot: "finale",
        priority: 0,
        run(runCtx) {
          if (runCtx.tick() === at) act(runCtx)
        },
      })
    },
  }
}

test("spawnUnit 生成装置单位；装置被摧毁时先倒下再移除，从快照去掉", () => {
  const battle = createBattle(
    spec({
      modules: ["script-0", "script-1"],
      tiles: [
        { x: 0, y: 0, height: 0, deployable: true, walkableBy: ["ground"] },
        { x: 1, y: 0, height: 0, deployable: true, walkableBy: ["ground"] },
      ],
      units: [ally("foe", { side: "enemy" })],
    }),
    [
      script(0, (ctx) => ctx.spawnUnit(ally("crate", { kind: "device", attributes: { hp: 30, atk: 0, def: 0 }, attackRange: [], x: 1 }))),
      script(1, (ctx) => ctx.dealDamage({ sourceId: "foe", targetId: "crate", amount: 50, kind: "true" })),
    ],
  )
  battle.drainEvents()
  battle.step()
  expect(battle.snapshot().units.find((unit) => unit.id === "crate")).toMatchObject({ kind: "device", x: 1, y: 0 })
  expect(battle.drainEvents().filter((event) => event.type === "spawn").map((event) => event.data)).toEqual([{ unitId: "crate" }])
  battle.step()
  const leaving = battle.drainEvents().filter((event) => event.type === "downed" || event.type === "removed")
  expect(leaving.map((event) => [event.type, event.data])).toEqual([
    ["downed", { unitId: "crate" }],
    ["removed", { unitId: "crate" }],
  ])
  expect(battle.snapshot().units.map((unit) => unit.id)).toEqual(["foe"])
})

test("干员倒下不移除，仍在快照里", () => {
  const battle = createBattle(spec({ modules: ["script-0"], units: [ally("guard", { attributes: { hp: 5, atk: 0, def: 0 } }), ally("foe", { side: "enemy" })] }), [
    script(0, (ctx) => ctx.dealDamage({ sourceId: "foe", targetId: "guard", amount: 50, kind: "true" })),
  ])
  battle.step()
  expect(battle.drainEvents().some((event) => event.type === "removed")).toBe(false)
  expect(battle.snapshot().units.find((unit) => unit.id === "guard")).toMatchObject({ downed: true })
})
