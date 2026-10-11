import { expect, test } from "vitest"
import { createBattle, type Intercept, type MissionModule } from "arknights-mission-core"
import { ally, spec } from "#test/fixture.js"

declare module "arknights-mission-core" {
  interface BattleEventMap {
    ping: { readonly step: number }
    guard: Intercept<{ readonly unitId: string; cancel: boolean }>
  }
}

test("订阅者里发的事件排队，等当前事件分发完按先进先出分发", () => {
  const seen: string[] = []
  const chain: MissionModule = {
    id: "chain",
    install(ctx) {
      ctx.subscribe("ping", (event, live) => {
        seen.push(`first:${event.data.step}`)
        if (event.data.step < 2) {
          live.emit("ping", { step: event.data.step + 1 })
          live.emit("ping", { step: event.data.step + 10 })
        }
      })
      ctx.subscribe("ping", (event) => {
        seen.push(`second:${event.data.step}`)
      })
      ctx.registerSystem({
        id: "chain",
        slot: "finale",
        priority: 0,
        run(runCtx) {
          if (runCtx.tick() === 0) runCtx.emit("ping", { step: 0 })
        },
      })
    },
  }
  const battle = createBattle(spec({ modules: ["chain"] }), [chain])
  battle.step()
  expect(seen).toEqual([
    "first:0",
    "second:0",
    "first:1",
    "second:1",
    "first:10",
    "second:10",
    "first:2",
    "second:2",
    "first:11",
    "second:11",
  ])
  const steps = battle
    .drainEvents()
    .filter((event) => event.type === "ping")
    .map((event) => (event.type === "ping" ? event.data.step : -1))
  expect(steps).toEqual([0, 1, 10, 2, 11])
})

test("可改写的事件在订阅者里也立即分发，发出者读到改写后的数据", () => {
  const order: string[] = []
  const probe: MissionModule = {
    id: "probe",
    install(ctx) {
      ctx.subscribe("damaged", (event, live) => {
        order.push(`damaged:${event.data.targetId}:${event.data.amount}`)
        if (event.data.targetId === "foe") live.dealDamage({ sourceId: "a", targetId: "b", amount: 10, kind: "true" })
        order.push("damaged-done")
      })
      ctx.subscribe("hit", (event) => {
        if (event.data.targetId === "b") event.data.amount = 4
        order.push(`hit:${event.data.targetId}`)
      })
      ctx.registerSystem({
        id: "probe",
        slot: "finale",
        priority: 0,
        run(runCtx) {
          if (runCtx.tick() === 0) runCtx.dealDamage({ sourceId: "a", targetId: "foe", amount: 7, kind: "true" })
        },
      })
    },
  }
  const battle = createBattle(
    spec({
      modules: ["probe"],
      units: [ally("a"), ally("b"), ally("foe", { side: "enemy" })],
    }),
    [probe],
  )
  battle.step()
  expect(order).toEqual(["hit:foe", "damaged:foe:7", "hit:b", "damaged-done", "damaged:b:4", "damaged-done"])
})

test("声明为 Intercept 的事件同步分发，订阅者能改写数据；只读事件的数据不能改写", () => {
  const order: string[] = []
  const probe: MissionModule = {
    id: "probe",
    install(ctx) {
      ctx.subscribe("ping", (event, live) => {
        // @ts-expect-error 只读事件的数据不能改写
        if (event.data.step < 0) event.data.step = 9
        const guard = { unitId: "a", cancel: false }
        live.intercept("guard", guard)
        order.push(`ping:${guard.cancel}`)
        if (event.data.step === 0) live.emit("ping", { step: 1 })
        order.push("ping-done")
      })
      ctx.subscribe("guard", (event) => {
        event.data.cancel = true
        order.push("guard")
      })
      ctx.registerSystem({
        id: "probe",
        slot: "finale",
        priority: 0,
        run(runCtx) {
          // @ts-expect-error 可拦截的事件只能经 intercept 发出
          if (runCtx.tick() < 0) runCtx.emit("guard", { unitId: "a", cancel: false })
          if (runCtx.tick() === 0) runCtx.emit("ping", { step: 0 })
        },
      })
    },
  }
  const battle = createBattle(spec({ modules: ["probe"], units: [ally("a")] }), [probe])
  battle.step()
  expect(order).toEqual(["guard", "ping:true", "ping-done", "guard", "ping:true", "ping-done"])
})
