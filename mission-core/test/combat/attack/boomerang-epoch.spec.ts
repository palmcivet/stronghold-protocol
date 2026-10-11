import { expect, test } from "vitest"
import { createBattle, redeployModule, type MissionModule } from "arknights-mission-core"
import { engineOf } from "#unit/record/index.js"
import { boomerangOf } from "#combat/attack/boomerang.js"
import { ally, spec } from "#test/fixture.js"

test("再部署清掉的回旋数，不会被还在飞的回程写回去", () => {
  const rig: MissionModule = {
    id: "rig",
    install(ctx) {
      ctx.registerSystem({
        id: "throw",
        slot: "schedule",
        priority: 0,
        run(runCtx) {
          if (runCtx.tick() === 0) {
            runCtx.launchProjectile({
              id: "out",
              sourceId: "a",
              targetId: "e",
              amount: 1,
              speed: 15,
              attack: { shape: { projectile: "boomerang" }, hitCount: 1, leg: "out", returnSpeed: 15 },
            })
          }
          if (runCtx.tick() === 1) runCtx.dealDamage({ sourceId: "e", targetId: "a", amount: 500, kind: "true" })
        },
      })
      ctx.registerSystem({
        id: "hold",
        slot: "redeploy",
        priority: 1,
        run(runCtx) {
          if (runCtx.tick() !== 1) return
          const world = engineOf(runCtx).world
          const unit = world.units.get("a")
          if (!unit) return
          boomerangOf(world, "a").out = 4
          unit.attributes.boomerangsOut = 4
        },
      })
    },
  }
  const tiles = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((x) => ({
    x,
    y: 0,
    height: 0,
    deployable: true,
    walkableBy: ["ground"],
  }))
  const battle = createBattle(
    spec({
      modules: ["rig", "redeploy"],
      tiles,
      cost: {
        ally: { initial: 5, regen: 0, cap: 5 },
        enemy: { initial: 0, regen: 0, cap: 0 },
      },
      units: [
        ally("a", {
          attributes: { hp: 20, maxHp: 20, atk: 10, cost: 0, respawnTime: 0 },
          timers: ["boomerang"],
        }),
        ally("e", { side: "enemy", x: 10, attributes: { hp: 100, def: 0 } }),
      ],
    }),
    [rig, redeployModule],
  )
  for (let step = 0; step < 50; step += 1) battle.step()
  expect(battle.snapshot().units.find((unit) => unit.id === "a")?.components["attack:boomerang"]).toEqual({ out: 4 })
})
