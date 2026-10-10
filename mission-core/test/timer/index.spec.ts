import { expect, test } from "vitest"
import { createBattle, type MissionModule } from "arknights-mission-core"
import { ally, spec } from "#test/fixture.js"

test("技力和攻击动作各自前进", () => {
  const log: {
    kind: string
    attackBefore: unknown
    attackAfter: unknown
    elapsedBefore: unknown
    elapsedAfter: unknown
    spBefore: unknown
    spAfter: unknown
  }[] = []
  const probe: MissionModule = {
    id: "probe",
    install(ctx) {
      ctx.registerSystem({
        id: "arm",
        slot: "schedule",
        priority: 1,
        run(runCtx) {
          runCtx.startTimer("a", "attack")
          runCtx.startTimer("a", "skill-point")
        },
      })
      ctx.registerSystem({
        id: "sp",
        slot: "ally",
        priority: -20,
        run(runCtx) {
          const attack = runCtx.timerView("a", "attack")
          const sp = runCtx.timerView("a", "skill-point")
          runCtx.advanceTimer("a", "skill-point")
          const attackAfter = runCtx.timerView("a", "attack")
          const spAfter = runCtx.timerView("a", "skill-point")
          log.push({
            kind: "sp",
            attackBefore: attack.phase,
            attackAfter: attackAfter.phase,
            elapsedBefore: attack.elapsed,
            elapsedAfter: attackAfter.elapsed,
            spBefore: sp.sp,
            spAfter: spAfter.sp,
          })
        },
      })
      ctx.registerSystem({
        id: "attack",
        slot: "ally",
        priority: -10,
        run(runCtx) {
          const attack = runCtx.timerView("a", "attack")
          const sp = runCtx.timerView("a", "skill-point")
          runCtx.advanceTimer("a", "attack")
          const attackAfter = runCtx.timerView("a", "attack")
          const spAfter = runCtx.timerView("a", "skill-point")
          log.push({
            kind: "attack",
            attackBefore: attack.phase,
            attackAfter: attackAfter.phase,
            elapsedBefore: attack.elapsed,
            elapsedAfter: attackAfter.elapsed,
            spBefore: sp.sp,
            spAfter: spAfter.sp,
          })
        },
      })
    },
  }
  const battle = createBattle(
    spec({
      modules: ["probe"],
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
    }),
    [probe],
  )
  battle.step()
  expect(log).toEqual([
    {
      kind: "sp",
      attackBefore: "idle",
      attackAfter: "idle",
      elapsedBefore: 0,
      elapsedAfter: 0,
      spBefore: 0,
      spAfter: 1,
    },
    {
      kind: "attack",
      attackBefore: "idle",
      attackAfter: "idle",
      elapsedBefore: 0,
      elapsedAfter: 0,
      spBefore: 1,
      spAfter: 1,
    },
  ])
})
