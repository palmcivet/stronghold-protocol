import { expect, test } from "vitest"
import { createBattle, PROJECTILE_SPEED, type MissionModule } from "arknights-mission-core"
import { ally, spec } from "../fixture.js"

function launch(speed?: number): MissionModule {
  return {
    id: "shot",
    install(ctx) {
      ctx.registerSystem({
        id: "shot",
        slot: "schedule",
        priority: 0,
        run(runCtx) {
          if (runCtx.tick() !== 0) return
          runCtx.launchProjectile({
            id: "p",
            sourceId: "a",
            targetId: "e",
            amount: 40,
            ...(speed !== undefined ? { speed } : {}),
          })
        },
      })
    },
  }
}

test("投射物按速度飞向目标，到达后走伤害", () => {
  const battle = createBattle(
    spec({
      modules: ["shot"],
      tiles: [0, 1, 2, 3, 4].map((x) => ({ x, y: 0, height: 0, deployable: true, walkableBy: ["ground"] })),
      units: [
        ally("a", { attributes: { hp: 100, atk: 10, def: 0 } }),
        ally("e", { side: "enemy", x: 4, y: 0, attributes: { hp: 100, def: 0 } }),
      ],
    }),
    [launch()],
  )
  battle.step()
  const first = battle.drainEvents()
  expect(first.some((event) => event.type === "projectile")).toBe(true)
  expect(first.some((event) => event.type === "damaged")).toBe(false)
  expect(first.find((event) => event.type === "projectile")?.data).toEqual({ id: "p", sourceId: "a", targetId: "e" })
  for (let step = 0; step < 8; step += 1) {
    battle.step()
    expect(battle.drainEvents().some((event) => event.type === "damaged")).toBe(false)
  }
  battle.step()
  const hit = battle.drainEvents()
  expect(hit.some((event) => event.type === "damaged")).toBe(true)
  expect(battle.snapshot().units.find((unit) => unit.id === "e")?.attributes.hp).toBe(60)
  expect(PROJECTILE_SPEED).toBe(12)
})

test("同一格上当拍命中；目标已经倒地则飞出去之前消掉", () => {
  const point = createBattle(
    spec({
      modules: ["shot"],
      units: [
        ally("a"),
        ally("e", { side: "enemy", attributes: { hp: 100, def: 0 } }),
      ],
    }),
    [launch(4)],
  )
  point.step()
  expect(point.snapshot().units.find((unit) => unit.id === "e")?.attributes.hp).toBe(60)

  const kill: MissionModule = {
    id: "shot",
    install(ctx) {
      ctx.registerSystem({
        id: "kill",
        slot: "schedule",
        priority: -1,
        run(runCtx) {
          if (runCtx.tick() !== 0) return
          runCtx.dealDamage({ sourceId: "a", targetId: "e", amount: 10, kind: "true" })
        },
      })
      ctx.registerSystem({
        id: "shot",
        slot: "schedule",
        priority: 1,
        run(runCtx) {
          if (runCtx.tick() !== 0) return
          runCtx.launchProjectile({ id: "p", sourceId: "a", targetId: "e", amount: 50 })
        },
      })
    },
  }
  const gone = createBattle(
    spec({
      modules: ["shot"],
      units: [
        ally("a"),
        ally("e", { side: "enemy", attributes: { hp: 10, def: 0 } }),
      ],
    }),
    [kill],
  )
  gone.step()
  const events = gone.drainEvents()
  expect(events.filter((event) => event.type === "damaged")).toHaveLength(1)
  expect(gone.snapshot().units.find((unit) => unit.id === "e")?.attributes.hp).toBe(0)
})
