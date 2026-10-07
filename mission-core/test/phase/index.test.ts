import { expect, test } from "vitest"
import { costModule, createBattle, redeployModule, type MissionModule } from "arknights-mission-core"
import { ally, spec } from "../fixture.js"

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
  expect(events.find((event) => event.data.name === "ally:-1")?.data.sp).toBe(0)
  expect(events.find((event) => event.data.name === "ally:1")?.data.sp).toBe(1)
})
