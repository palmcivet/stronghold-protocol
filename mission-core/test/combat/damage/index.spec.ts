import { expect, test } from "vitest"
import { NO_HEAL } from "#port/tag.js"
import { createBattle, type ContentContext, type MissionModule, type UnitSpec } from "arknights-mission-core"
import { ally, spec } from "#test/fixture.js"

function steps(): MissionModule {
  return {
    id: "steps",
    install(ctx) {
      ctx.registerDamageStep({
        id: "half",
        priority: 10,
        apply(info) {
          info.amount *= 0.5
        },
      })
      ctx.registerDamageStep({
        id: "cut",
        priority: 0,
        apply(info) {
          info.amount -= 2
        },
      })
    },
  }
}

test("减伤预览走已注册步骤且不写生命", () => {
  const module: MissionModule = {
    id: "preview",
    dependsOn: ["steps"],
    install(ctx) {
      ctx.registerSystem({
        id: "preview",
        slot: "schedule",
        priority: 1,
        run(runCtx) {
          const preview = runCtx.previewDamage({ sourceId: "a", targetId: "a", amount: 10, kind: "physical" })
          runCtx.emit("preview", { amount: preview.amount, steps: preview.steps.join(",") })
        },
      })
    },
  }
  const battle = createBattle(spec({ modules: ["steps", "preview"], units: [ally("a")] }), [steps(), module])
  battle.step()
  expect(battle.snapshot().units[0]?.attributes.hp).toBe(100)
  const events = battle.drainEvents()
  expect(events.some((event) => event.type === "damaged")).toBe(false)
  expect(events.find((event) => event.type === "preview")?.data).toEqual({
    amount: 4,
    steps: "cut,half,element,dodge,mitigate,multiplier,boss-limit,shield,hp",
  })
})

test("正式结算按优先级调用步骤并写入生命", () => {
  const module: MissionModule = {
    id: "commit",
    dependsOn: ["steps"],
    install(ctx) {
      ctx.registerSystem({
        id: "commit",
        slot: "schedule",
        priority: 1,
        run(runCtx) {
          runCtx.dealDamage({ sourceId: "a", targetId: "a", amount: 10, kind: "physical" })
          runCtx.loseHp("a", 1)
        },
      })
    },
  }
  const battle = createBattle(spec({ modules: ["steps", "commit"], units: [ally("a")] }), [steps(), module])
  battle.step()
  expect(battle.snapshot().units[0]?.attributes.hp).toBe(95)
  const types = battle.drainEvents().map((event) => event.type)
  expect(types).toContain("damaged")
  expect(types).toContain("loss")
  expect(types.indexOf("damaged")).toBeLessThan(types.indexOf("loss"))
})

function open(units: UnitSpec[], run: (ctx: ContentContext) => void, prepare?: MissionModule["install"]): ReturnType<typeof createBattle> {
  const module: MissionModule = {
    id: "case",
    install(ctx) {
      prepare?.(ctx)
      ctx.registerSystem({
        id: "case",
        slot: "schedule",
        priority: 1,
        run(runCtx) {
          if (runCtx.tick() !== 0) return
          run(runCtx)
        },
      })
    },
  }
  return createBattle(spec({ modules: ["case"], units }), [module])
}

function hpOf(battle: ReturnType<typeof createBattle>, id = "t"): number {
  return battle.snapshot().units.find((unit) => unit.id === id)?.attributes.hp ?? Number.NaN
}

function shieldOf(battle: ReturnType<typeof createBattle>, id = "t"): number {
  return battle.snapshot().units.find((unit) => unit.id === id)?.attributes.shield ?? 0
}

test("物理减伤含 5% 下限和忽略防御", () => {
  const plain = open([ally("t", { attributes: { hp: 1000, def: 40 } })], (ctx) => {
    ctx.dealDamage({ sourceId: "t", targetId: "t", amount: 100, kind: "physical" })
  })
  plain.step()
  expect(hpOf(plain)).toBe(940)

  const floor = open([ally("t", { attributes: { hp: 1000, def: 1000 } })], (ctx) => {
    ctx.dealDamage({ sourceId: "t", targetId: "t", amount: 100, kind: "physical" })
  })
  floor.step()
  expect(hpOf(floor)).toBe(995)

  const ignorePct = open([ally("t", { attributes: { hp: 1000, def: 80 } })], (ctx) => {
    ctx.dealDamage({ sourceId: "t", targetId: "t", amount: 100, kind: "physical", defIgnorePct: 0.5 })
  })
  ignorePct.step()
  expect(hpOf(ignorePct)).toBe(940)

  const ignoreFlat = open([ally("t", { attributes: { hp: 1000, def: 80 } })], (ctx) => {
    ctx.dealDamage({ sourceId: "t", targetId: "t", amount: 100, kind: "physical", defIgnoreFlat: 50 })
  })
  ignoreFlat.step()
  expect(hpOf(ignoreFlat)).toBe(930)

  const ignoreAll = open([ally("t", { attributes: { hp: 1000, def: 100 } })], (ctx) => {
    ctx.dealDamage({ sourceId: "t", targetId: "t", amount: 200, kind: "physical", defIgnorePct: 1 })
  })
  ignoreAll.step()
  expect(hpOf(ignoreAll)).toBe(800)
})

test("法术减伤含 5% 下限和忽略法抗", () => {
  const plain = open([ally("t", { attributes: { hp: 1000, res: 50 } })], (ctx) => {
    ctx.dealDamage({ sourceId: "t", targetId: "t", amount: 200, kind: "arts" })
  })
  plain.step()
  expect(hpOf(plain)).toBe(900)

  const floor = open([ally("t", { attributes: { hp: 1000, res: 100 } })], (ctx) => {
    ctx.dealDamage({ sourceId: "t", targetId: "t", amount: 100, kind: "arts" })
  })
  floor.step()
  expect(hpOf(floor)).toBe(995)

  const ignorePct = open([ally("t", { attributes: { hp: 1000, res: 80 } })], (ctx) => {
    ctx.dealDamage({ sourceId: "t", targetId: "t", amount: 200, kind: "arts", resIgnorePct: 0.5 })
  })
  ignorePct.step()
  expect(hpOf(ignorePct)).toBe(880)

  const ignoreFlat = open([ally("t", { attributes: { hp: 1000, res: 30 } })], (ctx) => {
    ctx.dealDamage({ sourceId: "t", targetId: "t", amount: 200, kind: "arts", resIgnoreFlat: 30 })
  })
  ignoreFlat.step()
  expect(hpOf(ignoreFlat)).toBe(800)
})

test("真实伤害不看法防", () => {
  const battle = open([ally("t", { attributes: { hp: 1000, def: 500, res: 90 } })], (ctx) => {
    ctx.dealDamage({ sourceId: "t", targetId: "t", amount: 80, kind: "true" })
  })
  battle.step()
  expect(hpOf(battle)).toBe(920)
})

test("元素伤害含 5% 下限，不吃通用脆弱，吃元素脆弱", () => {
  const floor = open([ally("t", { attributes: { hp: 1000, elementalRes: 100, def: 500, res: 90 } })], (ctx) => {
    ctx.dealDamage({ sourceId: "t", targetId: "t", amount: 100, kind: "elemental" })
  })
  floor.step()
  expect(hpOf(floor)).toBe(995)

  const resisted = open([ally("t", { attributes: { hp: 1000, elementalRes: 20 } })], (ctx) => {
    ctx.dealDamage({ sourceId: "t", targetId: "t", amount: 100, kind: "elemental" })
  })
  resisted.step()
  expect(hpOf(resisted)).toBe(920)

  const battle = open(
    [ally("t", { attributes: { hp: 1000 } })],
    (ctx) => {
      ctx.applyStatus("t", "fragile")
      ctx.applyStatus("t", "elemental-fragile")
      ctx.dealDamage({ sourceId: "t", targetId: "t", amount: 100, kind: "physical" })
      ctx.dealDamage({ sourceId: "t", targetId: "t", amount: 100, kind: "elemental" })
    },
    (ctx) => {
      ctx.registerStatus({
        id: "fragile",
        tags: [],
        modifiers: [{ attribute: "dmgTaken", op: "mul", value: 2 }],
        immunity: [],
        stackCap: 1,
        cancels: [],
        duration: 0,
      })
      ctx.registerStatus({
        id: "elemental-fragile",
        tags: [],
        modifiers: [{ attribute: "elementalTaken", op: "mul", value: 1.5 }],
        immunity: [],
        stackCap: 1,
        cancels: [],
        duration: 0,
      })
    },
  )
  battle.step()
  expect(hpOf(battle)).toBe(650)
})

test("来源伤害乘算和伤害自带乘数", () => {
  const battle = open(
    [ally("s", { attributes: { hp: 100 } }), ally("t", { attributes: { hp: 1000 } })],
    (ctx) => {
      ctx.applyStatus("s", "dealt")
      ctx.dealDamage({ sourceId: "s", targetId: "t", amount: 100, kind: "physical" })
      ctx.dealDamage({ sourceId: "s", targetId: "t", amount: 100, kind: "elemental" })
      ctx.dealDamage({ sourceId: "s", targetId: "t", amount: 40, kind: "true", mul: 2 })
    },
    (ctx) => {
      ctx.registerStatus({
        id: "dealt",
        tags: [],
        modifiers: [{ attribute: "dmgDealt", op: "mul", value: 2 }],
        immunity: [],
        stackCap: 1,
        cancels: [],
        duration: 0,
      })
    },
  )
  battle.step()
  expect(hpOf(battle)).toBe(440)
})

test("护盾先于生命，闪避不写生命也不扣护盾", () => {
  const soaked = open([ally("t", { attributes: { hp: 200, shield: 20 } })], (ctx) => {
    ctx.dealDamage({ sourceId: "t", targetId: "t", amount: 50, kind: "physical" })
  })
  soaked.step()
  expect(hpOf(soaked)).toBe(170)
  expect(shieldOf(soaked)).toBe(0)

  const dodged = open([ally("t", { attributes: { hp: 200, shield: 30, dodgePhys: 1 } })], (ctx) => {
    ctx.dealDamage({ sourceId: "t", targetId: "t", amount: 50, kind: "physical" })
  })
  dodged.step()
  expect(hpOf(dodged)).toBe(200)
  expect(shieldOf(dodged)).toBe(30)
  expect(dodged.drainEvents().some((event) => event.type === "damaged")).toBe(false)
})

test("预览和正式结算在闪避概率为 0 时同一个数，预览不改生命、护盾和随机数", () => {
  let preview = 0
  let randomHeld = false
  const module: MissionModule = {
    id: "case",
    install(ctx) {
      ctx.registerSystem({
        id: "case",
        slot: "schedule",
        priority: 1,
        run(runCtx) {
          const info = { sourceId: "t", targetId: "t", amount: 100, kind: "physical" }
          if (runCtx.tick() === 0) {
            const before = runCtx.random.state()
            preview = runCtx.previewDamage(info).amount
            randomHeld = runCtx.random.state() === before
            return
          }
          if (runCtx.tick() === 1) runCtx.dealDamage(info)
        },
      })
    },
  }
  const battle = createBattle(
    spec({
      modules: ["case"],
      units: [ally("t", { attributes: { hp: 200, def: 40, shield: 15, dodgePhys: 0 } })],
    }),
    [module],
  )
  battle.step()
  expect(randomHeld).toBe(true)
  expect(preview).toBe(45)
  expect(hpOf(battle)).toBe(200)
  expect(shieldOf(battle)).toBe(15)
  const previewEvents = battle.drainEvents().map((event) => event.type)
  expect(previewEvents).not.toContain("damaged")
  expect(previewEvents).not.toContain("hit")
  expect(previewEvents).not.toContain("elementHit")
  expect(previewEvents).not.toContain("fatal")
  battle.step()
  expect(hpOf(battle)).toBe(155)
  expect(shieldOf(battle)).toBe(0)
  expect(200 - hpOf(battle)).toBe(preview)
})

test("预览不掷闪避，正式结算仍用本场随机数", () => {
  const attributes = { hp: 200, def: 40, shield: 15, dodgePhys: 0.5 }
  const info = { sourceId: "t", targetId: "t", amount: 100, kind: "physical" }
  let preview = 0
  let randomHeld = false
  const previewFirst: MissionModule = {
    id: "case",
    install(ctx) {
      ctx.registerSystem({
        id: "case",
        slot: "schedule",
        priority: 1,
        run(runCtx) {
          if (runCtx.tick() === 0) {
            const before = runCtx.random.state()
            preview = runCtx.previewDamage(info).amount
            randomHeld = runCtx.random.state() === before
            return
          }
          if (runCtx.tick() === 1) runCtx.dealDamage(info)
        },
      })
    },
  }
  const direct: MissionModule = {
    id: "case",
    install(ctx) {
      ctx.registerSystem({
        id: "case",
        slot: "schedule",
        priority: 1,
        run(runCtx) {
          if (runCtx.tick() === 0) runCtx.dealDamage(info)
        },
      })
    },
  }
  const seeded = { seed: 7, modules: ["case"], units: [ally("t", { attributes })] }
  const withPreview = createBattle(spec(seeded), [previewFirst])
  withPreview.step()
  expect(preview).toBe(45)
  expect(randomHeld).toBe(true)
  expect(hpOf(withPreview)).toBe(200)
  expect(shieldOf(withPreview)).toBe(15)
  const previewEvents = withPreview.drainEvents().map((event) => event.type)
  expect(previewEvents).not.toContain("hit")
  expect(previewEvents).not.toContain("damaged")
  expect(previewEvents).not.toContain("elementHit")
  withPreview.step()
  const straight = createBattle(spec(seeded), [direct])
  straight.step()
  expect(hpOf(withPreview)).toBe(hpOf(straight))
  expect(shieldOf(withPreview)).toBe(shieldOf(straight))
})

test("闪避在减伤和首领限伤之前，成功则不写生命也不扣护盾", () => {
  let seen = -1
  let rolled = false
  const battle = open(
    [ally("t", { attributes: { hp: 400000, def: 80, shield: 40, dodgePhys: 1 }, hitLimit: true })],
    (ctx) => {
      const before = ctx.random.state()
      ctx.dealDamage({ sourceId: "t", targetId: "t", amount: 300000, kind: "physical" })
      rolled = ctx.random.state() !== before
    },
    (ctx) => {
      ctx.registerDamageStep({
        id: "between",
        priority: 175,
        apply(info) {
          seen = info.amount
        },
      })
    },
  )
  battle.step()
  expect(rolled).toBe(true)
  expect(seen).toBe(0)
  expect(hpOf(battle)).toBe(400000)
  expect(shieldOf(battle)).toBe(40)
  expect(battle.drainEvents().some((event) => event.type === "damaged")).toBe(false)
})

test("流失不减防御和法抗，不发 damaged", () => {
  const plain = open([ally("t", { attributes: { hp: 200, def: 40, res: 90, shield: 100, dodgePhys: 1 } })], (ctx) => {
    ctx.loseHp("t", 100)
  })
  plain.step()
  expect(hpOf(plain)).toBe(100)
  expect(shieldOf(plain)).toBe(100)
  const plainEvents = plain.drainEvents().map((event) => event.type)
  expect(plainEvents).not.toContain("damaged")
  expect(plainEvents).toContain("loss")

  const heavy = open([ally("t", { attributes: { hp: 400000, def: 1000, res: 90 } })], (ctx) => {
    ctx.loseHp("t", 300000)
  })
  heavy.step()
  expect(hpOf(heavy)).toBe(100000)
  const heavyEvents = heavy.drainEvents().map((event) => event.type)
  expect(heavyEvents).not.toContain("damaged")
  expect(heavyEvents).toContain("loss")

  const blocked = open(
    [ally("t", { attributes: { hp: 400000, def: 0, shield: 80 }, hitLimit: true })],
    (ctx) => {
      ctx.loseHp("t", 300000)
    },
  )
  blocked.step()
  expect(hpOf(blocked)).toBe(400000)
  expect(shieldOf(blocked)).toBe(80)
  const blockedEvents = blocked.drainEvents().map((event) => event.type)
  expect(blockedEvents).not.toContain("damaged")
  expect(blockedEvents).not.toContain("loss")

  const under = open(
    [ally("t", { attributes: { hp: 400000, def: 500, res: 90 }, hitLimit: true })],
    (ctx) => {
      ctx.loseHp("t", 299999)
    },
  )
  under.step()
  expect(hpOf(under)).toBe(100001)
  const underEvents = under.drainEvents().map((event) => event.type)
  expect(underEvents).not.toContain("damaged")
  expect(underEvents).toContain("loss")
})

test("首领限伤打开时超过阈值不扣生命，没打开时照常扣", () => {
  const blocked = open(
    [ally("t", { attributes: { hp: 400000, shield: 50 }, hitLimit: true })],
    (ctx) => {
      ctx.dealDamage({ sourceId: "t", targetId: "t", amount: 300000, kind: "true" })
    },
  )
  blocked.step()
  expect(hpOf(blocked)).toBe(400000)
  expect(shieldOf(blocked)).toBe(50)
  expect(blocked.drainEvents().some((event) => event.type === "damaged")).toBe(false)

  const under = open(
    [ally("t", { attributes: { hp: 400000 }, hitLimit: true })],
    (ctx) => {
      ctx.dealDamage({ sourceId: "t", targetId: "t", amount: 299999, kind: "true" })
    },
  )
  under.step()
  expect(hpOf(under)).toBe(100001)

  const openLimit = open([ally("t", { attributes: { hp: 400000 } })], (ctx) => {
    ctx.dealDamage({ sourceId: "t", targetId: "t", amount: 300000, kind: "true" })
  })
  openLimit.step()
  expect(hpOf(openLimit)).toBe(100000)
})

test("hit 在减伤前可以改伤害，fatal 可以把生命留在 1", () => {
  const hit = open([ally("t", { attributes: { hp: 100, def: 0 } })], (ctx) => {
    ctx.subscribe("hit", (event) => {
      const data = event.data as { amount: number }
      data.amount = 50
    })
    ctx.subscribe("fatal", (event) => {
      const data = event.data as { prevented: boolean }
      data.prevented = true
    })
    ctx.dealDamage({ sourceId: "t", targetId: "t", amount: 100, kind: "physical" })
  })
  hit.step()
  expect(hpOf(hit)).toBe(50)

  const saved = open([ally("t", { attributes: { hp: 30 } })], (ctx) => {
    ctx.subscribe("fatal", (event) => {
      const data = event.data as { prevented: boolean }
      data.prevented = true
    })
    ctx.dealDamage({ sourceId: "t", targetId: "t", amount: 100, kind: "true" })
  })
  saved.step()
  expect(hpOf(saved)).toBe(1)
})

test("治疗受乘算、禁疗和最大生命限制，溢出按 overheal 进护盾", () => {
  const capped = open([ally("t", { attributes: { hp: 40, maxHp: 100 } })], (ctx) => {
    ctx.heal("t", 50)
  })
  capped.step()
  expect(hpOf(capped)).toBe(90)

  const over = open([ally("t", { attributes: { hp: 40, maxHp: 100 } })], (ctx) => {
    ctx.heal("t", 80, { overheal: true })
  })
  over.step()
  expect(hpOf(over)).toBe(100)
  expect(shieldOf(over)).toBe(20)

  const blocked = open(
    [ally("t", { attributes: { hp: 40, maxHp: 100 } })],
    (ctx) => {
      ctx.applyStatus("t", "noHeal")
      ctx.heal("t", 10)
      ctx.heal("t", 10, { self: true })
    },
    (ctx) => {
      ctx.registerStatus({
        id: "noHeal",
        tags: [NO_HEAL],
        modifiers: [],
        immunity: [],
        stackCap: 1,
        cancels: [],
        duration: 0,
      })
    },
  )
  blocked.step()
  expect(hpOf(blocked)).toBe(50)
  expect(blocked.drainEvents().filter((event) => event.type === "heal")).toHaveLength(1)

  const taken = open(
    [ally("s", { attributes: { hp: 100 } }), ally("t", { attributes: { hp: 40, maxHp: 100 } })],
    (ctx) => {
      ctx.applyStatus("s", "heal-dealt")
      ctx.applyStatus("t", "heal-taken")
      ctx.heal("t", 10, { sourceId: "s" })
    },
    (ctx) => {
      ctx.registerStatus({
        id: "heal-dealt",
        tags: [],
        modifiers: [{ attribute: "healingDealt", op: "mul", value: 2 }],
        immunity: [],
        stackCap: 1,
        cancels: [],
        duration: 0,
      })
      ctx.registerStatus({
        id: "heal-taken",
        tags: [],
        modifiers: [{ attribute: "healingTaken", op: "mul", value: 2 }],
        immunity: [],
        stackCap: 1,
        cancels: [],
        duration: 0,
      })
    },
  )
  taken.step()
  expect(hpOf(taken)).toBe(80)
})
