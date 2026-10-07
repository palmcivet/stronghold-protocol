import { expect, test } from "vitest"
import {
  AMMO_CAP,
  AMMO_SCALE,
  CHARGE_CAP,
  TICK,
  UnknownRegistrationError,
  consumeAttackTiming,
  createBattle,
  independentDt,
  readAttackTiming,
  redeployModule,
  setAttackTargetThisTick,
  type MissionModule,
  type TimerView,
} from "arknights-mission-core"
import { sessionOf } from "../../battle/session.js"
import type { UnitState } from "../../battle/unit/index.js"
import { ally, spec } from "../fixture.js"

const body = { hp: 100, atk: 10, def: 0, aspd: 100, bat: 1 }

function steps(battle: { step(): void }, count: number): void {
  for (let index = 0; index < count; index += 1) battle.step()
}

function watch(ids: readonly string[]): { module: MissionModule; view: (id: string) => TimerView; unit: () => UnitState } {
  const seen = new Map<string, TimerView>()
  let current: UnitState | undefined
  const module: MissionModule = {
    id: "watch",
    install(ctx) {
      ctx.registerSystem({
        id: "watch",
        slot: "ally",
        priority: 10,
        run(runCtx) {
          current = sessionOf(runCtx).state.units.get("a")
          for (const id of ids) seen.set(id, runCtx.timerView("a", id))
        },
      })
    },
  }
  return {
    module,
    view: (id) => seen.get(id) ?? { started: false },
    unit: () => {
      if (!current) throw new Error("unit was not watched")
      return current
    },
  }
}

test("没有这些计时器时，出手次数是 1，可以攻击，伤害倍率是 1", () => {
  const seen = watch([])
  const battle = createBattle(
    spec({ modules: ["watch"], units: [ally("a", { attributes: body })] }),
    [seen.module],
  )
  battle.step()
  expect(readAttackTiming(seen.unit())).toEqual({ canAttack: true, hitCount: 1, damageScale: 1 })
})

test("没有目标时按攻击间隔积一层，读取不消耗", () => {
  const seen = watch(["charge"])
  const battle = createBattle(
    spec({ modules: ["watch"], units: [ally("a", { attributes: body, timers: ["charge"] })] }),
    [seen.module],
  )
  steps(battle, 29)
  expect(seen.view("charge").stored).toBe(0)
  steps(battle, 1)
  expect(seen.view("charge").stored).toBe(1)
  const timing = readAttackTiming(seen.unit())
  expect(timing.hitCount).toBe(2)
  expect(readAttackTiming(seen.unit()).hitCount).toBe(2)
  expect(seen.unit().timers.get("charge")?.stored).toBe(1)
})

test("范围内有目标时不积蓄，这一拍写成没有目标时照样积蓄", () => {
  const enemy = ally("e", { side: "enemy", x: 1, y: 0, attributes: { hp: 50, atk: 0, def: 0 } })
  const held = watch(["charge"])
  const blocked = createBattle(
    spec({ modules: ["watch"], units: [ally("a", { attributes: body, timers: ["charge"] }), enemy] }),
    [held.module],
  )
  steps(blocked, 40)
  expect(held.view("charge").stored).toBe(0)

  const mark: MissionModule = {
    id: "mark",
    install(ctx) {
      ctx.registerSystem({
        id: "mark",
        slot: "schedule",
        priority: 0,
        run(runCtx) {
          const unit = sessionOf(runCtx).state.units.get("a")
          if (unit) setAttackTargetThisTick(unit, false)
        },
      })
    },
  }
  const open = watch(["charge"])
  const battle = createBattle(
    spec({
      modules: ["mark", "watch"],
      units: [ally("a", { attributes: body, timers: ["charge"] }), enemy],
    }),
    [mark, open.module],
  )
  steps(battle, 30)
  expect(open.view("charge").stored).toBe(1)
})

test("这一拍写成有目标时，范围内没人也不积蓄", () => {
  const mark: MissionModule = {
    id: "mark",
    install(ctx) {
      ctx.registerSystem({
        id: "mark",
        slot: "schedule",
        priority: 0,
        run(runCtx) {
          const unit = sessionOf(runCtx).state.units.get("a")
          if (unit) setAttackTargetThisTick(unit, true)
        },
      })
    },
  }
  const seen = watch(["charge"])
  const battle = createBattle(
    spec({ modules: ["mark", "watch"], units: [ally("a", { attributes: body, timers: ["charge"] })] }),
    [mark, seen.module],
  )
  steps(battle, 40)
  expect(seen.view("charge").stored).toBe(0)
})

test("攻击冷却还没走完时不积蓄", () => {
  const arm: MissionModule = {
    id: "arm",
    install(ctx) {
      ctx.registerSystem({
        id: "arm",
        slot: "schedule",
        priority: 0,
        run(runCtx) {
          if (runCtx.tick() === 0) runCtx.startTimer("a", "attack")
        },
      })
    },
  }
  const seen = watch(["charge", "attack"])
  const battle = createBattle(
    spec({
      modules: ["arm", "watch"],
      units: [
        ally("a", { attributes: body, timers: ["charge"] }),
        ally("e", { side: "enemy", x: 1, y: 0, attributes: { hp: 500, atk: 0, def: 0 } }),
      ],
    }),
    [arm, seen.module],
  )
  steps(battle, 45)
  expect(seen.view("charge").stored).toBe(0)
  expect(seen.view("attack").started).toBe(true)
})

test("timerRate 和状态修饰加快同一条充能，不按种类分叉", () => {
  const fast = watch(["charge"])
  const rated = createBattle(
    spec({
      modules: ["watch"],
      units: [ally("a", { attributes: { ...body, timerRate: 2 }, timers: ["charge"] })],
    }),
    [fast.module],
  )
  steps(rated, 14)
  expect(fast.view("charge").stored).toBe(0)
  steps(rated, 1)
  expect(fast.view("charge").stored).toBe(1)

  const haste: MissionModule = {
    id: "haste",
    install(ctx) {
      ctx.registerStatus({
        id: "haste",
        flags: [],
        modifiers: [{ attribute: "timerRate", op: "mul", value: 2 }],
        immunity: [],
        stackCap: 1,
        cancels: [],
        duration: 0,
      })
      ctx.registerSystem({
        id: "apply",
        slot: "status",
        priority: -1,
        run(runCtx) {
          if (runCtx.tick() === 0) runCtx.applyStatus("a", "haste")
        },
      })
    },
  }
  const seen = watch(["charge"])
  const battle = createBattle(
    spec({ modules: ["haste", "watch"], units: [ally("a", { attributes: body, timers: ["charge"] })] }),
    [haste, seen.module],
  )
  steps(battle, 15)
  expect(seen.view("charge").stored).toBe(1)
})

test("不能行动时不积蓄，层数停在 times", () => {
  const stun: MissionModule = {
    id: "stun",
    install(ctx) {
      ctx.registerSystem({
        id: "stun",
        slot: "status",
        priority: -1,
        run(runCtx) {
          if (runCtx.tick() === 0) runCtx.applyStatus("a", "stun")
        },
      })
    },
  }
  const seen = watch(["charge"])
  const battle = createBattle(
    spec({ modules: ["stun", "watch"], units: [ally("a", { attributes: body, timers: ["charge"] })] }),
    [stun, seen.module],
  )
  steps(battle, 40)
  expect(seen.view("charge").stored).toBe(0)

  const capped = watch(["charge"])
  const limited = createBattle(
    spec({
      modules: ["watch"],
      units: [ally("a", { attributes: { ...body, times: 1 }, timers: ["charge"] })],
    }),
    [capped.module],
  )
  steps(limited, 90)
  expect(capped.view("charge").stored).toBe(1)
  expect(CHARGE_CAP).toBe(3)
})

test("出手后清掉充能并消耗一发", () => {
  let scale = 0
  let hits = 0
  const swing: MissionModule = {
    id: "swing",
    install(ctx) {
      ctx.registerSystem({
        id: "swing",
        slot: "ally",
        priority: 10,
        run(runCtx) {
          if (runCtx.tick() !== 30) return
          const unit = sessionOf(runCtx).state.units.get("a")
          if (!unit) return
          const before = readAttackTiming(unit)
          scale = before.damageScale
          hits = before.hitCount
          consumeAttackTiming(unit)
        },
      })
    },
  }
  const seen = watch(["charge", "ammo"])
  const battle = createBattle(
    spec({
      modules: ["swing", "watch"],
      units: [ally("a", { attributes: body, timers: ["charge", "ammo"] })],
    }),
    [swing, seen.module],
  )
  steps(battle, 31)
  expect(hits).toBe(2)
  expect(scale).toBe(AMMO_SCALE)
  expect(seen.view("charge").stored).toBe(0)
  expect(seen.view("ammo").ammo).toBe(AMMO_CAP - 1)
})

test("弹药打空后不能攻击，倍率回到 1，再过 1 秒开始装填", () => {
  const spend: MissionModule = {
    id: "spend",
    install(ctx) {
      ctx.registerSystem({
        id: "spend",
        slot: "schedule",
        priority: 0,
        run(runCtx) {
          const unit = sessionOf(runCtx).state.units.get("a")
          if (!unit || runCtx.tick() >= 2) return
          consumeAttackTiming(unit)
        },
      })
    },
  }
  const seen = watch(["ammo"])
  const battle = createBattle(
    spec({
      modules: ["spend", "watch"],
      units: [ally("a", { attributes: { ...body, ammoMax: 2, atk_scale: 1.5 }, timers: ["ammo"] })],
    }),
    [spend, seen.module],
  )
  steps(battle, 3)
  expect(readAttackTiming(seen.unit())).toEqual({ canAttack: false, hitCount: 1, damageScale: 1 })
  steps(battle, 57)
  expect(seen.view("ammo").ammo).toBe(0)
  steps(battle, 1)
  expect(seen.view("ammo").ammo).toBe(1)
})

test("timerRate 加快装填，不缩短离上次攻击的 1 秒", () => {
  const spend: MissionModule = {
    id: "spend",
    install(ctx) {
      ctx.registerSystem({
        id: "spend",
        slot: "schedule",
        priority: 0,
        run(runCtx) {
          if (runCtx.tick() !== 0) return
          const unit = sessionOf(runCtx).state.units.get("a")
          if (unit) consumeAttackTiming(unit)
        },
      })
    },
  }
  const seen = watch(["ammo"])
  const battle = createBattle(
    spec({
      modules: ["spend", "watch"],
      units: [ally("a", { attributes: { ...body, ammoMax: 2, timerRate: 2 }, timers: ["ammo"] })],
    }),
    [spend, seen.module],
  )
  steps(battle, 44)
  expect(seen.view("ammo").ammo).toBe(1)
  steps(battle, 1)
  expect(seen.view("ammo").ammo).toBe(2)
})

test("回旋数量大于 0 时不能攻击，再部署后清零并补满弹药", () => {
  let blocked = false
  const prep: MissionModule = {
    id: "prep",
    install(ctx) {
      ctx.registerSystem({
        id: "prep",
        slot: "schedule",
        priority: 0,
        run(runCtx) {
          if (runCtx.tick() !== 0) return
          const unit = sessionOf(runCtx).state.units.get("a")
          if (!unit) return
          unit.boomerangsOut = 2
          unit.attributes.boomerangsOut = 2
          blocked = !readAttackTiming(unit).canAttack
          consumeAttackTiming(unit)
          runCtx.dealDamage({ sourceId: "a", targetId: "a", amount: 500, kind: "true" })
        },
      })
    },
  }
  const seen = watch(["ammo"])
  const battle = createBattle(
    spec({
      modules: ["prep", "watch", "redeploy"],
      cost: {
        ally: { initial: 0, regen: 0, cap: 0 },
        enemy: { initial: 0, regen: 0, cap: 0 },
      },
      units: [
        ally("a", {
          attributes: { hp: 20, maxHp: 20, atk: 0, def: 0, cost: 0, respawnTime: 0 },
          timers: ["ammo", "boomerang"],
        }),
      ],
    }),
    [prep, seen.module, redeployModule],
  )
  battle.step()
  expect(blocked).toBe(true)
  expect(seen.unit().attributes.boomerangsOut).toBe(0)
  expect(seen.unit().timers.get("ammo")?.ammo).toBe(AMMO_CAP)
  expect(readAttackTiming(seen.unit()).canAttack).toBe(true)
})

test("新登记的计时器在友方槽按 timerRate 推进", () => {
  const pulse: MissionModule = {
    id: "pulse",
    install(ctx) {
      ctx.registerTimer({
        id: "pulse",
        slot: "ally",
        create: () => ({ elapsed: 0 }),
        advance(timer, unitId, runCtx) {
          const { state, registry } = sessionOf(runCtx)
          const unit = state.units.get(unitId)
          if (!unit) return
          const elapsed = typeof timer.elapsed === "number" ? timer.elapsed : 0
          timer.elapsed = elapsed + independentDt(unit, registry)
        },
        cancel(timer) {
          timer.elapsed = 0
        },
        view(timer) {
          return { elapsed: typeof timer.elapsed === "number" ? timer.elapsed : 0 }
        },
      })
    },
  }
  const seen = watch(["pulse"])
  const battle = createBattle(
    spec({
      modules: ["pulse", "watch"],
      units: [ally("a", { attributes: { ...body, timerRate: 2 }, timers: ["pulse"] })],
    }),
    [pulse, seen.module],
  )
  battle.step()
  expect(seen.view("pulse").elapsed).toBeCloseTo(2 * TICK)
})

test("规格点了未登记的计时器时拒绝创建", () => {
  try {
    createBattle(spec({ units: [ally("a", { timers: ["missing"] })] }), [])
    expect.unreachable()
  } catch (error) {
    expect(error).toBeInstanceOf(UnknownRegistrationError)
    expect((error as UnknownRegistrationError).registry).toBe("timer")
    expect((error as UnknownRegistrationError).id).toBe("missing")
  }
})
