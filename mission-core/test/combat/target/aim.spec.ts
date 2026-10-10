import { expect, test } from "vitest"
import {
  createBattle,
  readAttackTiming,
  setAttackTargetThisTick,
  type MissionModule,
} from "arknights-mission-core"
import { engineOf } from "#unit/record/index.js"
import { attackTargetIds } from "#combat/target/aim.js"
import { hasTag } from "#kernel/world/tag.js"
import { SLEEP, UNTARGETABLE } from "#port/tag.js"
import { ally, spec } from "#test/fixture.js"

const body = { hp: 100, atk: 40, def: 0, aspd: 100, bat: 1 }

test("治疗攻击的充能看治疗名单，不看打敌人的那条链", () => {
  const battle = createBattle(
    spec({
      units: [
        ally("a", {
          attributes: body,
          timers: ["charge"],
          attackShape: { damage: "heal" },
          attackRange: [{ x: 1, y: 0 }],
        }),
        ally("hurt", { x: 1, attributes: { hp: 10, maxHp: 100, atk: 0, def: 0 } }),
      ],
    }),
    [],
  )
  for (let step = 0; step < 40; step += 1) battle.step()
  const probe: MissionModule = {
    id: "probe",
    install(ctx) {
      ctx.registerSystem({
        id: "probe",
        slot: "ally",
        priority: 10,
        run(runCtx) {
          stored = Number(runCtx.timerView("a", "charge").stored ?? 0)
        },
      })
    },
  }
  let stored = -1
  const watched = createBattle(
    spec({
      modules: ["probe"],
      units: [
        ally("a", {
          attributes: body,
          timers: ["charge"],
          attackShape: { damage: "heal" },
          attackRange: [{ x: 1, y: 0 }],
        }),
        ally("hurt", { x: 1, attributes: { hp: 10, maxHp: 100, atk: 0, def: 0 } }),
      ],
    }),
    [probe],
  )
  for (let step = 0; step < 40; step += 1) watched.step()
  expect(stored).toBe(0)
  expect(battle.snapshot().units.length).toBe(2)
})

test("没有目标这一拍会打断已经开始的前摇", () => {
  let phase = ""
  const mark: MissionModule = {
    id: "mark",
    install(ctx) {
      ctx.registerSystem({
        id: "arm",
        slot: "schedule",
        priority: 0,
        run(runCtx) {
          if (runCtx.tick() === 0) runCtx.startTimer("a", "attack")
          if (runCtx.tick() === 4) {
            const unit = engineOf(runCtx).world.units.get("a")
            if (unit) setAttackTargetThisTick(unit, false)
          }
        },
      })
      ctx.registerSystem({
        id: "read",
        slot: "ally",
        priority: 10,
        run(runCtx) {
          if (runCtx.tick() === 4) phase = String(runCtx.timerView("a", "attack").phase)
        },
      })
    },
  }
  const battle = createBattle(
    spec({
      modules: ["mark"],
      units: [
        ally("a", { attributes: body, attackClip: { duration: 1, hit: 0.5 } }),
        ally("e", { side: "enemy", x: 1, attributes: { hp: 50, atk: 0, def: 0 } }),
      ],
    }),
    [mark],
  )
  for (let step = 0; step < 4; step += 1) battle.step()
  expect(phase).toBe("")
  battle.step()
  expect(phase).toBe("idle")
})

test("atk_scale 走属性汇总", () => {
  let scale = 0
  const mod: MissionModule = {
    id: "mod",
    install(ctx) {
      ctx.registerStatus({
        id: "ammo-up",
        tags: [],
        modifiers: [{ attribute: "atk_scale", op: "mul", value: 2 }],
        immunity: [],
        stackCap: 1,
        cancels: [],
        duration: 0,
      })
      ctx.registerSystem({
        id: "mod",
        slot: "ally",
        priority: 10,
        run(runCtx) {
          const unit = engineOf(runCtx).world.units.get("a")
          if (!unit) return
          scale = readAttackTiming(unit, engineOf(runCtx).registry).damageScale
        },
      })
    },
  }
  const battle = createBattle(
    spec({
      modules: ["mod"],
      units: [ally("a", { attributes: { ...body, atk_scale: 1.5 }, timers: ["ammo"] })],
    }),
    [mod],
  )
  const arm: MissionModule = {
    id: "arm",
    install(ctx) {
      ctx.registerSystem({
        id: "arm",
        slot: "schedule",
        priority: 0,
        run(runCtx) {
          if (runCtx.tick() !== 0) return
          runCtx.applyStatus("a", "ammo-up")
        },
      })
    },
  }
  const live = createBattle(
    spec({
      modules: ["mod", "arm"],
      units: [ally("a", { attributes: { ...body, atk_scale: 1.5 }, timers: ["ammo"] })],
    }),
    [mod, arm],
  )
  live.step()
  expect(scale).toBeCloseTo(3)
  battle.step()
})

test("友方槽的计时写在敌人身上不会启动", () => {
  let started = true
  const look: MissionModule = {
    id: "look",
    install(ctx) {
      ctx.registerSystem({
        id: "look",
        slot: "schedule",
        priority: 0,
        run(runCtx) {
          if (runCtx.tick() !== 1) return
          started = runCtx.timerView("e", "charge").started === true
          runCtx.startTimer("e", "ammo")
          started = started || runCtx.timerView("e", "ammo").started === true
        },
      })
    },
  }
  const battle = createBattle(
    spec({
      modules: ["look"],
      units: [ally("e", { side: "enemy", attributes: body, timers: ["charge", "boomerang"] })],
    }),
    [look],
  )
  battle.step()
  battle.step()
  expect(started).toBe(false)
})

test("治疗照常选中沉睡的友方；带不可选中的友方不选", () => {
  const hurt = { hp: 10, maxHp: 100, atk: 0, def: 0 }
  let picked: readonly string[] = []
  let sleeperAsleep = false
  let sleeperUntargetable = true
  const probe: MissionModule = {
    id: "probe",
    install(ctx) {
      ctx.registerSystem({
        id: "probe",
        slot: "schedule",
        priority: 0,
        run(runCtx) {
          if (runCtx.tick() === 0) {
            runCtx.applyStatus("asleep", "sleep", { duration: 5 })
            runCtx.grantTag("veiled", UNTARGETABLE, "case")
            return
          }
          if (runCtx.tick() !== 1) return
          const { world, registry } = engineOf(runCtx)
          const healer = world.units.get("a")
          const sleeper = world.units.get("asleep")
          if (!healer || !sleeper) return
          sleeperAsleep = hasTag(sleeper, SLEEP)
          sleeperUntargetable = hasTag(sleeper, UNTARGETABLE)
          picked = attackTargetIds(world, registry, runCtx, healer)
        },
      })
    },
  }
  const battle = createBattle(
    spec({
      modules: ["probe"],
      units: [
        ally("a", {
          attributes: body,
          attackShape: { damage: "heal", healCount: 3 },
          attackRange: [{ x: 1, y: 0 }, { x: 2, y: 0 }],
        }),
        ally("asleep", { x: 1, attributes: hurt }),
        ally("veiled", { x: 2, attributes: hurt }),
      ],
    }),
    [probe],
  )
  battle.step()
  battle.step()
  expect(sleeperAsleep).toBe(true)
  expect(sleeperUntargetable).toBe(false)
  expect(picked).toEqual(["asleep"])
})
