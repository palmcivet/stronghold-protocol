import { expect, test } from "vitest"
import {
  AUTO_OP_COOLDOWN,
  TICK,
  UnknownRegistrationError,
  createBattle,
  type MissionModule,
  type SkillSpec,
  type UnitSpec,
} from "arknights-mission-core"
import { ally, spec } from "../fixture.js"

const cooldownTicks = Math.round(AUTO_OP_COOLDOWN / TICK)

test("随时间的技力在眩晕时仍涨，阻回时不涨", () => {
  let granted = -1
  const watch = recorder("watch", ["stun", "blocked"])
  const gate: MissionModule = {
    id: "gate",
    install(ctx) {
      ctx.registerStatus({
        id: "stop-sp",
        flags: ["noSp"],
        modifiers: [],
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
          if (runCtx.tick() !== 0) return
          runCtx.applyStatus("stun", "stun")
          runCtx.applyStatus("blocked", "stop-sp")
          granted = runCtx.gainSp("blocked", "s", 4)
        },
      })
    },
  }
  const gated = createBattle(
    spec({
      modules: ["gate", "watch"],
      units: [timed("stun", "NEVER"), timed("blocked", "NEVER")],
    }),
    [gate, watch.module],
  )
  for (let step = 0; step < 5; step += 1) gated.step()
  expect(granted).toBe(0)
  expect(watch.read("stun").sp).toBe(5)
  expect(watch.read("blocked").sp).toBe(0)
})

test("充能满层后不再继续涨", () => {
  const watch = recorder("watch", ["a"])
  let second = -1
  const fill: MissionModule = {
    id: "fill",
    install(ctx) {
      ctx.registerSystem({
        id: "fill",
        slot: "schedule",
        priority: 1,
        run(runCtx) {
          if (runCtx.tick() !== 0) return
          runCtx.gainSp("a", "s", 25)
          second = runCtx.gainSp("a", "s", 10)
        },
      })
    },
  }
  const battle = createBattle(
    spec({
      modules: ["fill", "watch"],
      units: [
        ally("a", {
          skills: [
            {
              id: "s",
              body: "instant",
              trigger: "NEVER",
              spCost: 10,
              duration: 0,
              ammo: 0,
              charges: 2,
              spType: "none",
            },
          ],
        }),
      ],
    }),
    [fill, watch.module],
  )
  battle.step()
  const view = watch.read("a")
  expect(second).toBe(0)
  expect(view.charges).toBe(2)
  expect(view.sp).toBe(10)
})

test("MANUAL 的自动释放遵守操作冷却，直接释放可以在冷却中放出并重新开始冷却", () => {
  const auto = recorder("auto", ["manual"])
  const manual = createBattle(
    spec({
      modules: ["auto"],
      units: [charged("manual", "MANUAL")],
    }),
    [auto.module],
  )
  for (let step = 0; step < cooldownTicks; step += 1) manual.step()
  expect(auto.read("manual").activations).toBe(0)
  manual.step()
  expect(auto.read("manual").activations).toBe(1)

  const direct = recorder("direct", ["hand"])
  const early: MissionModule = {
    id: "early",
    install(ctx) {
      ctx.registerSystem({
        id: "early",
        slot: "ally",
        priority: -1,
        run(runCtx) {
          if (runCtx.tick() !== cooldownTicks - 10) return
          runCtx.castSkill("hand", "s")
        },
      })
    },
  }
  const handed = createBattle(
    spec({
      modules: ["early", "direct"],
      units: [charged("hand", "MANUAL")],
    }),
    [early, direct.module],
  )
  for (let step = 0; step <= cooldownTicks; step += 1) handed.step()
  expect(direct.read("hand").activations).toBe(1)
  const restarted = cooldownTicks - 10 + cooldownTicks
  for (let step = cooldownTicks + 1; step <= restarted; step += 1) handed.step()
  expect(direct.read("hand").activations).toBe(2)

  const free = recorder("free", ["auto"])
  const automatic = createBattle(
    spec({
      modules: ["free"],
      units: [charged("auto", "AUTO")],
    }),
    [free.module],
  )
  automatic.step()
  expect(free.read("auto").activations).toBe(1)
})

test("duration 结束时修饰撤下，持续期间不回复技力", () => {
  const watch = recorder("watch", ["a"])
  const open: MissionModule = {
    id: "open",
    install(ctx) {
      ctx.registerSystem({
        id: "open",
        slot: "schedule",
        priority: 1,
        run(runCtx) {
          if (runCtx.tick() === 0) runCtx.castSkill("a", "s")
        },
      })
    },
  }
  const battle = createBattle(
    spec({
      modules: ["open", "watch"],
      units: [
        ally("a", {
          attributes: { hp: 100, atk: 10, def: 0, spRecovery: 30 },
          skills: [
            {
              id: "s",
              body: "duration",
              trigger: "NEVER",
              spCost: 50,
              initSp: 50,
              duration: 1,
              ammo: 0,
              spType: "time",
              mods: [{ attribute: "atk", op: "add", value: 25 }],
            },
          ],
        }),
      ],
    }),
    [open, watch.module],
  )
  for (let step = 0; step < 29; step += 1) battle.step()
  expect(battle.snapshot().units[0]?.attributes.atk).toBe(35)
  expect(watch.read("a").sp).toBe(0)
  battle.step()
  expect(battle.snapshot().units[0]?.attributes.atk).toBe(10)
  expect(watch.read("a").sp).toBe(1)
})

test("攻击前摇被眩晕取消则命中不发生，技力计时器的相位不被这次取消推动", () => {
  const hits: string[] = []
  let before = { phase: "", elapsed: -1 }
  let after = { phase: "", elapsed: -1 }
  const module: MissionModule = {
    id: "case",
    install(ctx) {
      ctx.subscribe("attack-hit", (event) => {
        hits.push(String(event.data.unitId))
      })
      ctx.registerSystem({
        id: "arm",
        slot: "schedule",
        priority: 1,
        run(runCtx) {
          if (runCtx.tick() !== 0) return
          runCtx.startTimer("stun", "attack")
          runCtx.startTimer("open", "attack")
        },
      })
      ctx.registerSystem({
        id: "apply",
        slot: "status",
        priority: -1,
        run(runCtx) {
          if (runCtx.tick() !== 1) return
          const view = runCtx.timerView("stun", "skill-point")
          before = { phase: String(view.phase), elapsed: Number(view.elapsed) }
          runCtx.applyStatus("stun", "stun")
          const next = runCtx.timerView("stun", "skill-point")
          after = { phase: String(next.phase), elapsed: Number(next.elapsed) }
        },
      })
    },
  }
  const battle = createBattle(
    spec({
      modules: ["case"],
      units: [
        timed("stun", "NEVER", { duration: 0.1, hit: 0.05 }),
        timed("open", "NEVER", { duration: 0.1, hit: 0.05 }),
        ally("foe", { side: "enemy", x: 1, y: 0, attributes: { hp: 500 } }),
      ],
    }),
    [module],
  )
  battle.step()
  battle.step()
  battle.step()
  expect(hits).toEqual(["open"])
  expect(after).toEqual(before)
  expect(before.elapsed).toBe(1)
})

test("凋亡每秒扣的是技能计时器里的技力", () => {
  const watch = recorder("watch", ["a"])
  const burst: MissionModule = {
    id: "burst",
    install(ctx) {
      ctx.registerSystem({
        id: "burst",
        slot: "schedule",
        priority: 1,
        run(runCtx) {
          if (runCtx.tick() !== 0) return
          runCtx.dealDamage({
            sourceId: "a",
            targetId: "a",
            amount: 1000,
            kind: "element",
            element: "apoptosis",
          })
        },
      })
    },
  }
  const battle = createBattle(
    spec({
      modules: ["burst", "watch"],
      units: [
        ally("a", {
          attributes: { hp: 5000, atk: 10, def: 0, res: 0, sp: 99 },
          skills: [
            {
              id: "s",
              body: "instant",
              trigger: "NEVER",
              spCost: 30,
              initSp: 8,
              duration: 0,
              ammo: 0,
              spType: "none",
            },
          ],
        }),
      ],
    }),
    [burst, watch.module],
  )
  for (let step = 0; step < 30; step += 1) battle.step()
  expect(watch.read("a").sp).toBe(7)
  expect(battle.snapshot().units[0]?.attributes.sp).toBe(99)
})

test("未知触发标识被拒绝", () => {
  const skill: SkillSpec = {
    id: "s",
    body: "instant",
    trigger: "NOPE",
    spCost: 0,
    duration: 0,
    ammo: 0,
  }
  expect(() => createBattle(spec({ units: [ally("a", { skills: [skill] })] }), [])).toThrow(UnknownRegistrationError)
  try {
    createBattle(spec({ units: [ally("a", { skills: [skill] })] }), [])
    expect.unreachable()
  } catch (error) {
    expect(error).toBeInstanceOf(UnknownRegistrationError)
    expect((error as UnknownRegistrationError).registry).toBe("skill-trigger")
    expect((error as UnknownRegistrationError).id).toBe("NOPE")
  }
  const known = createBattle(
    spec({
      units: [ally("a", { skills: [{ ...skill, trigger: "DEFAULT" }] })],
    }),
    [],
  )
  expect(known.snapshot().units.map((unit) => unit.id)).toEqual(["a"])
})

test("技能范围无视不可选中，初始范围不放", () => {
  const ends: string[] = []
  const module: MissionModule = {
    id: "case",
    install(ctx) {
      ctx.registerStatus({
        id: "ghost",
        flags: ["untargetable"],
        modifiers: [],
        immunity: [],
        stackCap: 1,
        cancels: [],
        duration: 0,
      })
      ctx.registerSystem({
        id: "mark",
        slot: "schedule",
        priority: 1,
        run(runCtx) {
          if (runCtx.tick() !== 0) return
          runCtx.applyStatus("e", "ghost")
          runCtx.startTimer("basic", "attack")
        },
      })
    },
  }
  const watch = recorder("watch", ["range", "basic"])
  const battle = createBattle(
    spec({
      modules: ["case", "watch"],
      units: [
        caster("range", "SKILL_RANGE", (moment) => {
          ends.push(`range:${moment.reason}`)
        }),
        caster("basic", "DEFAULT"),
        ally("e", { side: "enemy", x: 1, y: 0, attributes: { hp: 100 } }),
      ],
    }),
    [module, watch.module],
  )
  battle.step()
  battle.step()
  expect(watch.read("range").activations).toBe(1)
  expect(watch.read("basic").activations).toBe(0)
  expect(ends).toEqual(["range:instant"])
})

test("替换当次攻击要范围内有受伤友方，条件消失则退回充能", () => {
  const reasons: string[] = []
  const hits: string[] = []
  const skill = (id: string): SkillSpec => ({
    id: "s",
    body: "instant",
    trigger: "DEFAULT",
    spCost: 0,
    duration: 0,
    ammo: 0,
    operation: "AUTO",
    triggerAllies: true,
    triggerHpAtMost: 0.5,
    onHit: () => {
      hits.push(id)
    },
    onEnd: (moment) => {
      reasons.push(`${id}:${moment.reason}`)
    },
  })
  const castWatch = recorder("cast-watch", ["cast"])
  const backWatch = recorder("back-watch", ["back"])
  const attack: MissionModule = {
    id: "attack",
    install(ctx) {
      ctx.registerSystem({
        id: "arm",
        slot: "schedule",
        priority: 1,
        run(runCtx) {
          if (runCtx.tick() === 0) runCtx.startTimer("cast", "attack")
        },
      })
    },
  }
  const cast = createBattle(
    spec({
      modules: ["attack", "cast-watch"],
      units: [operator("cast", skill("cast")), injured(), enemy()],
    }),
    [attack, castWatch.module],
  )
  cast.step()
  cast.step()
  expect(hits).toEqual(["cast"])
  expect(reasons).toEqual(["cast:instant"])

  const heal: MissionModule = {
    id: "heal",
    install(ctx) {
      ctx.registerSystem({
        id: "heal",
        slot: "schedule",
        priority: 1,
        run(runCtx) {
          if (runCtx.tick() === 0) runCtx.castSkill("back", "s")
          if (runCtx.tick() === 1) runCtx.heal("friend", 80)
        },
      })
    },
  }
  const back = createBattle(
    spec({
      modules: ["heal", "back-watch"],
      units: [operator("back", skill("back")), injured(), enemy()],
    }),
    [heal, backWatch.module],
  )
  back.step()
  expect(backWatch.read("back").charges).toBe(0)
  back.step()
  expect(reasons).toContain("back:withdrawn")
  expect(hits).toEqual(["cast"])
  expect(backWatch.read("back").charges).toBe(1)
})

function timed(id: string, trigger: SkillSpec["trigger"], attackClip?: UnitSpec["attackClip"]): UnitSpec {
  return ally(id, {
    attributes: { hp: 100, atk: 10, def: 0, spRecovery: 30 },
    ...(attackClip ? { attackClip } : {}),
    skills: [
      {
        id: "s",
        body: "instant",
        trigger,
        spCost: 100,
        duration: 0,
        ammo: 0,
        spType: "time",
      },
    ],
  })
}

function charged(id: string, operation: "MANUAL" | "AUTO"): UnitSpec {
  return ally(id, {
    skills: [
      {
        id: "s",
        body: "instant",
        trigger: "SP_FULL",
        spCost: 0,
        duration: 0,
        ammo: 0,
        charges: 2,
        operation,
        spType: "none",
      },
    ],
  })
}

function caster(id: string, trigger: string, onEnd?: SkillSpec["onEnd"]): UnitSpec {
  return ally(id, {
    attackRange: [{ x: 1, y: 0 }],
    skills: [
      {
        id: "s",
        body: "instant",
        trigger,
        spCost: 0,
        duration: 0,
        ammo: 0,
        operation: "AUTO",
        triggerRange: [{ x: 1, y: 0 }],
        ...(onEnd ? { onEnd } : {}),
      },
    ],
  })
}

function operator(id: string, skill: SkillSpec): UnitSpec {
  return ally(id, {
    attackRange: [{ x: 1, y: 0 }],
    skills: [skill],
  })
}

function injured(): UnitSpec {
  return ally("friend", { x: 1, y: 0, attributes: { hp: 40, maxHp: 100, atk: 1, def: 0 } })
}

function enemy(): UnitSpec {
  return ally("foe", { side: "enemy", x: 1, y: 0, attributes: { hp: 100 } })
}

function recorder(id: string, unitIds: readonly string[]): {
  module: MissionModule
  read(unitId: string): { sp: number; charges: number; activations: number }
} {
  const latest = new Map<string, { sp: number; charges: number; activations: number }>()
  return {
    module: {
      id,
      install(ctx) {
        ctx.registerSystem({
          id,
          slot: "finale",
          priority: 0,
          run(runCtx) {
            for (const unitId of unitIds) {
              const view = runCtx.timerView(unitId, "skill-point")
              latest.set(unitId, {
                sp: Number(view.sp ?? 0),
                charges: Number(view.charges ?? 0),
                activations: Number(view.activations ?? 0),
              })
            }
          },
        })
      },
    },
    read(unitId) {
      const view = latest.get(unitId)
      if (!view) throw new Error(`没有读到 ${unitId}`)
      return view
    },
  }
}
