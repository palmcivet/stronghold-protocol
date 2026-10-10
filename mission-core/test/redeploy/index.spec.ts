import { expect, test } from "vitest"
import { createBattle, redeployModule, type MissionModule } from "arknights-mission-core"
import { ally, spec } from "#test/fixture.js"

function hit(id: string): MissionModule {
  return {
    id: "hit",
    install(ctx) {
      ctx.registerSystem({
        id: "hit",
        slot: "schedule",
        priority: 0,
        run(runCtx) {
          if (runCtx.tick() !== 0) return
          runCtx.dealDamage({ sourceId: id, targetId: id, amount: 500, kind: "true" })
        },
      })
    },
  }
}

test("倒计时走完并且费用够时，在当前坐标满血回到场上", () => {
  const calls: string[] = []
  const strategy: MissionModule = {
    id: "manual",
    install(ctx) {
      ctx.registerDeployStrategy({
        id: "manual",
        opening() {
          return ["a"]
        },
        downedTile() {
          calls.push("downed")
          return { x: 4, y: 3 }
        },
        canStand() {
          return true
        },
      })
    },
  }
  const battle = createBattle(
    spec({
      modules: ["manual", "hit", "redeploy"],
      deployStrategy: "manual",
      cost: {
        ally: { initial: 10, regen: 0, cap: 99 },
        enemy: { initial: 0, regen: 0, cap: 0 },
      },
      tiles: [
        { x: 0, y: 0, height: 0, deployable: true, walkableBy: ["ground"] },
        { x: 4, y: 3, height: 0, deployable: true, walkableBy: ["ground"] },
      ],
      units: [ally("a", { attributes: { hp: 40, maxHp: 80, atk: 0, def: 0, cost: 3, respawnTime: 0 } })],
    }),
    [strategy, hit("a"), redeployModule],
  )
  battle.step()
  expect(calls).toEqual(["downed"])
  expect(battle.snapshot().units.find((unit) => unit.id === "a")).toMatchObject({ x: 4, y: 3 })
  expect(battle.snapshot().units.find((unit) => unit.id === "a")?.attributes.hp).toBe(80)
  const events = battle.drainEvents()
  const downed = events.findIndex((event) => event.type === "downed")
  const deployed = events.findIndex((event, index) => event.type === "deploy" && index > downed)
  expect(downed).toBeGreaterThanOrEqual(0)
  expect(deployed).toBeGreaterThan(downed)
  expect(events.filter((event) => event.type === "cost").map((event) => event.data)).toEqual([{ side: "ally", value: 7 }])
})

test("费用不够就继续等，够了的那一拍再回来", () => {
  const pay: MissionModule = {
    id: "pay",
    install(ctx) {
      ctx.registerSystem({
        id: "pay",
        slot: "schedule",
        priority: 1,
        run(runCtx) {
          if (runCtx.tick() === 1) runCtx.addCost("ally", 4)
        },
      })
    },
  }
  const battle = createBattle(
    spec({
      modules: ["hit", "pay", "redeploy"],
      cost: {
        ally: { initial: 0, regen: 0, cap: 20 },
        enemy: { initial: 0, regen: 0, cap: 0 },
      },
      units: [ally("a", { attributes: { hp: 10, maxHp: 25, cost: 4, respawnTime: 0 } })],
    }),
    [hit("a"), pay, redeployModule],
  )
  battle.drainEvents()
  battle.step()
  expect(battle.snapshot().units.find((unit) => unit.id === "a")?.attributes.hp).toBe(0)
  expect(battle.drainEvents().some((event) => event.type === "deploy")).toBe(false)
  battle.step()
  expect(battle.snapshot().units.find((unit) => unit.id === "a")).toMatchObject({ x: 0, y: 0 })
  expect(battle.snapshot().units.find((unit) => unit.id === "a")?.attributes.hp).toBe(25)
  expect(battle.drainEvents().some((event) => event.type === "deploy")).toBe(true)
})

test("再部署时间按秒走，敌人扣自己阵营的费用", () => {
  const battle = createBattle(
    spec({
      modules: ["hit", "redeploy"],
      cost: {
        ally: { initial: 9, regen: 0, cap: 9 },
        enemy: { initial: 6, regen: 0, cap: 6 },
      },
      units: [
        ally("foe", {
          side: "enemy",
          attributes: { hp: 5, maxHp: 12, cost: 6, respawnTime: 1 },
        }),
      ],
    }),
    [hit("foe"), redeployModule],
  )
  battle.step()
  expect(battle.snapshot().units.find((unit) => unit.id === "foe")?.attributes.hp).toBe(0)
  for (let step = 0; step < 28; step += 1) battle.step()
  expect(battle.snapshot().units.find((unit) => unit.id === "foe")?.attributes.hp).toBe(0)
  battle.step()
  expect(battle.snapshot().units.find((unit) => unit.id === "foe")?.attributes.hp).toBe(12)
  const costs = battle.drainEvents().filter((event) => event.type === "cost")
  expect(costs.map((event) => event.data)).toEqual([{ side: "enemy", value: 0 }])
})
