import { expect, test } from "vitest"
import { createBattle, redeployModule, type MissionModule } from "arknights-mission-core"
import { ally, spec } from "#test/fixture.js"

function down(id: string): MissionModule {
  return {
    id: "down",
    install(ctx) {
      ctx.registerSystem({
        id: "down",
        slot: "schedule",
        priority: 0,
        run(runCtx) {
          if (runCtx.tick() !== 0) return
          runCtx.addElement(id, "burn", 1)
          runCtx.dealDamage({ sourceId: id, targetId: id, amount: 500, kind: "true" })
        },
      })
    },
  }
}

test("再部署等待乘上 redeployMul，回来时清空元素并重置技能", () => {
  const battle = createBattle(
    spec({
      modules: ["down", "redeploy"],
      cost: {
        ally: { initial: 20, regen: 0, cap: 20 },
        enemy: { initial: 0, regen: 0, cap: 0 },
      },
      units: [
        ally("a", {
          attributes: { hp: 10, maxHp: 40, cost: 0, respawnTime: 1, redeployMul: 0.5 },
          skills: [
            {
              id: "s",
              body: "instant",
              trigger: "NEVER",
              spCost: 10,
              duration: 0,
              ammo: 0,
              initSp: 3,
            },
          ],
        }),
      ],
    }),
    [down("a"), redeployModule],
  )
  battle.step()
  expect(battle.snapshot().units.find((unit) => unit.id === "a")?.attributes.hp).toBe(0)
  for (let step = 0; step < 13; step += 1) battle.step()
  expect(battle.snapshot().units.find((unit) => unit.id === "a")?.attributes.hp).toBe(0)
  battle.step()
  const back = battle.snapshot().units.find((unit) => unit.id === "a")
  expect(back?.attributes.hp).toBe(40)
  expect(back?.elements.burn ?? 0).toBe(0)
  expect(battle.drainEvents().some((event) => event.type === "deploy")).toBe(true)
})
