import { expect, test } from "vitest"
import {
  blockModule,
  costModule,
  createBattle,
  DEPLOY_STRATEGY,
  deployModule,
  leakModule,
  RegistrationConflictError,
  redeployModule,
  UnknownRegistrationError,
  type BattleEvent,
  type MissionModule,
  type PhaseSystem,
} from "arknights-mission-core"
import { ally, spec } from "#test/fixture.js"

declare module "arknights-mission-core" {
  interface BattleEventMap {
    trace: { readonly name: string; readonly sp?: number | string | boolean }
  }
}

test("系统按阶段槽和优先级运行", () => {
  const probe: MissionModule = {
    id: "probe",
    install(ctx) {
      ctx.registerSystem({
        id: "schedule-late",
        slot: "schedule",
        priority: 1,
        run(runCtx) {
          runCtx.emit("trace", { name: "schedule:1" })
        },
      })
      ctx.registerSystem({
        id: "schedule-early",
        slot: "schedule",
        priority: -1,
        run(runCtx) {
          runCtx.emit("trace", { name: "schedule:-1" })
          runCtx.schedule(runCtx.tick(), (scheduled) => {
            scheduled.emit("trace", { name: "callback" })
          })
          runCtx.startTimer("a", "skill-point")
        },
      })
      ctx.registerSystem({
        id: "spawn-late",
        slot: "spawn",
        priority: 1,
        run(runCtx) {
          runCtx.emit("trace", { name: "spawn:1" })
        },
      })
      ctx.registerSystem({
        id: "spawn-early",
        slot: "spawn",
        priority: -1,
        run(runCtx) {
          runCtx.emit("trace", { name: "spawn:-1" })
        },
      })
      ctx.registerSystem({
        id: "cost-late",
        slot: "cost",
        priority: 5,
        run(runCtx) {
          runCtx.emit("trace", { name: "cost:5" })
        },
      })
      ctx.registerSystem({
        id: "cost-early",
        slot: "cost",
        priority: -2,
        run(runCtx) {
          runCtx.emit("trace", { name: "cost:-2" })
        },
      })
      ctx.registerSystem({
        id: "status",
        slot: "status",
        priority: 1,
        run(runCtx) {
          runCtx.emit("trace", { name: "status" })
        },
      })
      ctx.registerSystem({
        id: "enemy",
        slot: "enemy",
        priority: 0,
        run(runCtx) {
          runCtx.emit("trace", { name: "enemy" })
        },
      })
      ctx.registerSystem({
        id: "enemy-index",
        slot: "enemy-index",
        priority: 0,
        run(runCtx) {
          runCtx.emit("trace", { name: "enemy-index" })
        },
      })
      ctx.registerSystem({
        id: "ally-after",
        slot: "ally",
        priority: 1,
        run(runCtx) {
          runCtx.emit("trace", { name: "ally:1", sp: runCtx.timerView("a", "skill-point").sp ?? -1 })
        },
      })
      ctx.registerSystem({
        id: "ally-before",
        slot: "ally",
        priority: -1,
        run(runCtx) {
          runCtx.emit("trace", { name: "ally:-1", sp: runCtx.timerView("a", "skill-point").sp ?? -1 })
        },
      })
      ctx.registerSystem({
        id: "projectile",
        slot: "projectile",
        priority: 0,
        run(runCtx) {
          runCtx.emit("trace", { name: "projectile" })
        },
      })
      ctx.registerSystem({
        id: "redeploy-probe",
        slot: "redeploy",
        priority: 1,
        run(runCtx) {
          runCtx.emit("trace", { name: "redeploy" })
        },
      })
      ctx.registerSystem({
        id: "finale",
        slot: "finale",
        priority: 0,
        run(runCtx) {
          runCtx.emit("trace", { name: "finale" })
        },
      })
    },
  }
  const battle = createBattle(
    spec({
      modules: ["probe", "cost", "redeploy"],
      units: [
        ally("a", {
          attributes: { hp: 100, atk: 10, def: 0, spRecovery: 30 },
          skills: [
            {
              id: "s",
              body: "instant",
              trigger: "NEVER",
              spCost: 100,
              duration: 0,
              ammo: 0,
              spType: "time",
            },
          ],
        }),
      ],
      spawns: [{ atTick: 0, unit: ally("spawned", { x: 3, y: 1 }) }],
    }),
    [probe, costModule, redeployModule],
  )
  const initialEvents = battle.drainEvents()
  expect(initialEvents.map((event) => event.type)).toEqual(["deploy"])
  battle.step()
  const events = battle.drainEvents()
  const labels = events.map((event) => (event.type === "trace" ? String(event.data.name) : event.type))
  expect(labels).toEqual([
    "schedule:-1",
    "callback",
    "schedule:1",
    "spawn:-1",
    "spawn",
    "spawn:1",
    "cost:-2",
    "cost:5",
    "status",
    "enemy",
    "enemy-index",
    "ally:-1",
    "ally:1",
    "projectile",
    "redeploy",
    "finale",
  ])
  const traced = (name: string) => events.find((event): event is BattleEvent<"trace"> => event.type === "trace" && event.data.name === name)
  expect(traced("ally:-1")?.data.sp).toBe(0)
  expect(traced("ally:1")?.data.sp).toBe(1)
})

test("内置系统的执行顺序", () => {
  const battle = createBattle(
    spec({ modules: ["block", "cost", DEPLOY_STRATEGY, "leak", "redeploy"] }),
    [blockModule, costModule, deployModule, leakModule, redeployModule],
  )
  expect(battle.systemOrder().map((entry) => `${entry.slot} ${entry.id}`)).toEqual([
    "schedule engine:schedule",
    "spawn engine:spawn",
    "cost cost",
    "status engine:status-timers",
    "enemy block-before",
    "enemy engine:enemy-route",
    "enemy leak",
    "enemy block-after",
    "enemy engine:enemy-attack",
    "ally engine:ally-timers",
    "projectile engine:projectile",
    "redeploy redeploy",
    "finale engine:modifiers",
  ])
})

function systems(list: readonly Omit<PhaseSystem, "run">[]): MissionModule {
  return {
    id: "systems",
    install(ctx) {
      for (const system of list) {
        ctx.registerSystem({
          ...system,
          run(runCtx) {
            runCtx.emit("trace", { name: system.id })
          },
        })
      }
    },
  }
}

test("before 与 after 在 priority 与注册先后之上调整同槽顺序", () => {
  const battle = createBattle(spec({ modules: ["systems"] }), [
    systems([
      { id: "a", slot: "ally", priority: 0 },
      { id: "b", slot: "ally", priority: 0, before: ["a"] },
      { id: "c", slot: "ally", priority: -1, after: ["a"] },
      { id: "d", slot: "ally", priority: 5 },
      { id: "e", slot: "ally", priority: 9, before: ["d"], after: ["b"] },
    ]),
  ])
  const ally = battle
    .systemOrder()
    .filter((entry) => entry.slot === "ally")
    .map((entry) => entry.id)
  expect(ally).toEqual(["engine:ally-timers", "b", "a", "c", "e", "d"])
  battle.step()
  const traced = battle
    .drainEvents()
    .filter((event): event is BattleEvent<"trace"> => event.type === "trace")
    .map((event) => event.data.name)
  expect(traced).toEqual(["b", "a", "c", "e", "d"])
})

test("同 id 的系统再注册报冲突", () => {
  const twice = systems([
    { id: "same", slot: "ally", priority: 0 },
    { id: "same", slot: "enemy", priority: 0 },
  ])
  expect(() => createBattle(spec({ modules: ["systems"] }), [twice])).toThrow(RegistrationConflictError)
  expect(() => createBattle(spec({ modules: ["systems"] }), [systems([{ id: "engine:spawn", slot: "spawn", priority: 1 }])])).toThrow(
    RegistrationConflictError,
  )
})

test("before 与 after 只能引用同槽系统，成环时报错", () => {
  const elsewhere = systems([
    { id: "a", slot: "ally", priority: 0 },
    { id: "b", slot: "enemy", priority: 0, after: ["a"] },
  ])
  expect(() => createBattle(spec({ modules: ["systems"] }), [elsewhere])).toThrow(UnknownRegistrationError)
  const loop = systems([
    { id: "a", slot: "ally", priority: 0, after: ["b"] },
    { id: "b", slot: "ally", priority: 0, after: ["a"] },
  ])
  expect(() => createBattle(spec({ modules: ["systems"] }), [loop])).toThrow(/成环: a, b/)
})
