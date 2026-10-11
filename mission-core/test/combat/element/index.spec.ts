import { expect, test } from "vitest"
import { createBattle, type ContentContext, type MissionModule, type UnitSpec } from "arknights-mission-core"
import { ally, spec } from "#test/fixture.js"

test("元素槽按标识存放", () => {
  const bursts: string[] = []
  const module: MissionModule = {
    id: "elements",
    install(ctx) {
      ctx.registerElement({
        id: "burn",
        cap: 10,
        resistance: 0,
        onBurst(unitId) {
          bursts.push(unitId)
        },
      })
      ctx.registerElement({
        id: "neural",
        cap: 10,
        resistance: 20,
      })
      ctx.registerSystem({
        id: "charge",
        slot: "schedule",
        priority: 1,
        run(runCtx) {
          runCtx.addElement("a", "burn", 4)
          runCtx.addElement("a", "burn", 8)
          runCtx.addElement("a", "burn", 3)
          runCtx.addElement("a", "neural", 2)
        },
      })
    },
  }
  const battle = createBattle(spec({ modules: ["elements"], units: [ally("a")] }), [module])
  battle.step()
  expect(bursts).toEqual(["a"])
  expect(battle.snapshot().units[0]?.elements).toEqual({ burn: 10, neural: 2 })
})

function open(units: UnitSpec[], run: (ctx: ContentContext) => void, prepare?: MissionModule["install"]) {
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

function unitOf(battle: ReturnType<typeof createBattle>, id: string) {
  const unit = battle.snapshot().units.find((item) => item.id === id)
  if (!unit) throw new Error(`单位不存在: ${id}`)
  return unit
}

test("元素槽按注册抗性摄入，100% 抗性落到 5%", () => {
  const battle = open(
    [ally("t", { attributes: { hp: 500 } })],
    (ctx) => {
      ctx.dealDamage({ sourceId: "t", targetId: "t", amount: 100, kind: "element", element: "brine" })
      ctx.dealDamage({ sourceId: "t", targetId: "t", amount: 100, kind: "element", element: "sealed" })
    },
    (ctx) => {
      ctx.registerElement({ id: "brine", cap: 1000, resistance: 50 })
      ctx.registerElement({ id: "sealed", cap: 1000, resistance: 100 })
    },
  )
  battle.step()
  expect(unitOf(battle, "t").elements).toEqual({ brine: 50, sealed: 5 })
  expect(unitOf(battle, "t").attributes.hp).toBe(500)
})

test("元素损伤不吃来源伤害乘算，只吃元素损伤倍率", () => {
  const battle = open(
    [ally("s", { attributes: { hp: 100 } }), ally("t", { side: "enemy", attributes: { hp: 5000 } })],
    (ctx) => {
      ctx.applyStatus("s", "dealt")
      ctx.applyStatus("t", "intake")
      ctx.dealDamage({ sourceId: "s", targetId: "t", amount: 100, kind: "element", element: "burn" })
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
      ctx.registerStatus({
        id: "intake",
        tags: [],
        modifiers: [{ attribute: "elemTaken", op: "mul", value: 2 }],
        immunity: [],
        stackCap: 1,
        cancels: [],
        duration: 0,
      })
    },
  )
  battle.step()
  expect(unitOf(battle, "t").elements.burn).toBe(200)
  expect(unitOf(battle, "t").attributes.hp).toBe(5000)
})

test("敌人灼燃蓄满后爆发 7000 元素伤害且不再进槽", () => {
  const credits: string[] = []
  const battle = open(
    [ally("s", { attributes: { hp: 100 } }), ally("t", { side: "enemy", attributes: { hp: 20000 } })],
    (ctx) => {
      ctx.subscribe("fatal", (event) => {
        credits.push(String(event.data.creditId))
      })
      ctx.applyStatus("s", "dealt")
      ctx.dealDamage({ sourceId: "s", targetId: "t", amount: 1000, kind: "element", element: "burn" })
      ctx.dealDamage({ sourceId: "s", targetId: "t", amount: 500, kind: "element", element: "neural" })
    },
    (ctx) => {
      ctx.registerStatus({
        id: "dealt",
        tags: [],
        modifiers: [
          { attribute: "dmgDealt", op: "mul", value: 2 },
          { attribute: "resIgnorePct", op: "add", value: 1 },
        ],
        immunity: [],
        stackCap: 1,
        cancels: [],
        duration: 0,
      })
    },
  )
  battle.step()
  const target = unitOf(battle, "t")
  expect(target.attributes.hp).toBe(13000)
  expect(target.elements).toEqual({ burn: 1000 })
  expect(target.attributes.palsy ?? 0).toBe(0)
  expect(credits).toEqual([])
})

test("干员灼燃是无来源法术伤害，先降法抗", () => {
  const battle = open(
    [ally("s", { attributes: { hp: 100 } }), ally("t", { attributes: { hp: 5000, res: 50 } })],
    (ctx) => {
      ctx.applyStatus("s", "dealt")
      ctx.dealDamage({ sourceId: "s", targetId: "t", amount: 1000, kind: "element", element: "burn" })
    },
    (ctx) => {
      ctx.registerStatus({
        id: "dealt",
        tags: [],
        modifiers: [
          { attribute: "dmgDealt", op: "mul", value: 2 },
          { attribute: "resIgnorePct", op: "add", value: 1 },
        ],
        immunity: [],
        stackCap: 1,
        cancels: [],
        duration: 0,
      })
    },
  )
  battle.step()
  expect(unitOf(battle, "t").attributes.hp).toBe(4160)
  expect(unitOf(battle, "t").elements.burn).toBe(1000)
})

test("敌人神经爆发 6000 元素伤害并叠 3 层麻痹", () => {
  const battle = open([ally("t", { side: "enemy", attributes: { hp: 20000 } })], (ctx) => {
    ctx.dealDamage({ sourceId: "t", targetId: "t", amount: 1000, kind: "element", element: "neural" })
  })
  battle.step()
  const target = unitOf(battle, "t")
  expect(target.attributes.hp).toBe(14000)
  expect(target.attributes.palsy).toBeUndefined()
  expect(target.elements.neural).toBe(1000)
})

test("干员神经爆发是 1000 真实伤害并带眩晕", () => {
  const battle = open([ally("t", { attributes: { hp: 5000, def: 800 } })], (ctx) => {
    ctx.dealDamage({ sourceId: "t", targetId: "t", amount: 1000, kind: "element", element: "neural" })
  })
  battle.step()
  const target = unitOf(battle, "t")
  expect(target.attributes.hp).toBe(4000)
  expect(target.tags).toContain("stun")
  expect(target.tags).toContain("burst-lock")
})

test("干员侵蚀先降防御再造成 800 物理伤害", () => {
  const battle = open([ally("t", { attributes: { hp: 5000, def: 150 } })], (ctx) => {
    ctx.dealDamage({ sourceId: "t", targetId: "t", amount: 1000, kind: "element", element: "erosion" })
  })
  battle.step()
  expect(unitOf(battle, "t").attributes.hp).toBe(4250)
})

test("敌人侵蚀爆发 5000 元素伤害", () => {
  const battle = open([ally("t", { side: "enemy", attributes: { hp: 20000, def: 300 } })], (ctx) => {
    ctx.dealDamage({ sourceId: "t", targetId: "t", amount: 1000, kind: "element", element: "erosion" })
  })
  battle.step()
  expect(unitOf(battle, "t").attributes.hp).toBe(15000)
})

test("没有生命不填槽", () => {
  const battle = open([ally("t", { attributes: { hp: 0 } })], (ctx) => {
    ctx.dealDamage({ sourceId: "t", targetId: "t", amount: 1000, kind: "element", element: "burn" })
    ctx.addElement("t", "neural", 10)
  })
  battle.step()
  expect(unitOf(battle, "t").elements).toEqual({})
  expect(unitOf(battle, "t").attributes.hp).toBe(0)
})

test("属性 gaugeMax 提高槽上限后才爆发", () => {
  const battle = open([ally("t", { side: "enemy", attributes: { hp: 30000, gaugeMax: 2000 } })], (ctx) => {
    ctx.dealDamage({ sourceId: "t", targetId: "t", amount: 1000, kind: "element", element: "burn" })
    ctx.dealDamage({ sourceId: "t", targetId: "t", amount: 1000, kind: "element", element: "burn" })
  })
  battle.step()
  const target = unitOf(battle, "t")
  expect(target.elements.burn).toBe(2000)
  expect(target.attributes.hp).toBe(23000)
})

test("预览不填槽，爆发冷却结束前不再填，结束后槽归零", () => {
  let preview = 0
  const module: MissionModule = {
    id: "case",
    install(ctx) {
      ctx.registerSystem({
        id: "case",
        slot: "schedule",
        priority: 1,
        run(runCtx) {
          const info = { sourceId: "t", targetId: "t", amount: 1000, kind: "element", element: "burn" }
          if (runCtx.tick() === 0) {
            preview = runCtx.previewDamage(info).amount
            return
          }
          if (runCtx.tick() === 1) {
            runCtx.dealDamage(info)
            runCtx.dealDamage({ sourceId: "t", targetId: "t", amount: 400, kind: "element", element: "neural" })
          }
        },
      })
    },
  }
  const battle = createBattle(
    spec({ modules: ["case"], units: [ally("t", { side: "enemy", attributes: { hp: 20000 } })] }),
    [module],
  )
  battle.step()
  expect(preview).toBe(1000)
  expect(unitOf(battle, "t").elements).toEqual({})
  expect(unitOf(battle, "t").attributes.hp).toBe(20000)
  const previewEvents = battle.drainEvents().map((event) => event.type)
  expect(previewEvents).not.toContain("damaged")
  expect(previewEvents).not.toContain("element-hit")
  expect(previewEvents).not.toContain("element-burst")
  expect(previewEvents).not.toContain("hit")
  battle.step()
  expect(unitOf(battle, "t").attributes.hp).toBe(13000)
  expect(unitOf(battle, "t").elements).toEqual({ burn: 1000 })
  for (let step = 0; step < 298; step += 1) battle.step()
  expect(unitOf(battle, "t").elements.burn).toBe(1000)
  battle.step()
  expect(unitOf(battle, "t").elements.burn).toBe(0)
})

test("填槽发 element-hit，不发 damaged；爆发发 element-burst", () => {
  const quiet: string[] = []
  const filled = open([ally("t", { attributes: { hp: 500 } })], (ctx) => {
    for (const type of ["element-hit", "element-burst", "hit", "damaged"] as const) {
      ctx.subscribe(type, () => {
        quiet.push(type)
      })
    }
    ctx.dealDamage({ sourceId: "t", targetId: "t", amount: 100, kind: "element", element: "burn" })
  })
  filled.step()
  expect(quiet).toEqual(["element-hit"])
  expect(unitOf(filled, "t").elements.burn).toBe(100)
  expect(unitOf(filled, "t").attributes.hp).toBe(500)

  const burst: string[] = []
  const bursting = open([ally("t", { side: "enemy", attributes: { hp: 20000 } })], (ctx) => {
    for (const type of ["element-hit", "element-burst", "hit", "damaged"] as const) {
      ctx.subscribe(type, () => {
        burst.push(type)
      })
    }
    ctx.dealDamage({ sourceId: "t", targetId: "t", amount: 1000, kind: "element", element: "burn" })
  })
  bursting.step()
  expect(burst).toEqual(["element-hit", "element-burst", "hit", "damaged"])
  expect(unitOf(bursting, "t").elements.burn).toBe(1000)
  expect(unitOf(bursting, "t").attributes.hp).toBe(13000)
})

test("element-hit 可改损伤，或把 kind 改成生命伤害", () => {
  const scaled = open([ally("t", { attributes: { hp: 500 } })], (ctx) => {
    ctx.subscribe("element-hit", (event) => {
      const data = event.data as { amount: number; mul: number }
      data.amount = 40
      data.mul = 2
    })
    ctx.dealDamage({ sourceId: "t", targetId: "t", amount: 100, kind: "element", element: "burn" })
  })
  scaled.step()
  expect(unitOf(scaled, "t").elements.burn).toBe(80)
  expect(unitOf(scaled, "t").attributes.hp).toBe(500)
  expect(scaled.drainEvents().some((event) => event.type === "damaged")).toBe(false)

  const turned: string[] = []
  const life = open([ally("t", { attributes: { hp: 100 } })], (ctx) => {
    ctx.subscribe("element-hit", (event) => {
      const data = event.data as { kind: string }
      data.kind = "true"
    })
    for (const type of ["element-hit", "hit", "damaged", "element-burst"] as const) {
      ctx.subscribe(type, () => {
        turned.push(type)
      })
    }
    ctx.dealDamage({ sourceId: "t", targetId: "t", amount: 30, kind: "element", element: "burn" })
  })
  life.step()
  expect(unitOf(life, "t").attributes.hp).toBe(70)
  expect(unitOf(life, "t").elements).toEqual({})
  expect(turned).toEqual(["element-hit", "hit", "damaged"])

  const stopped = open([ally("t", { attributes: { hp: 500 } })], (ctx) => {
    ctx.subscribe("element-hit", (event) => {
      const data = event.data as { cancel: boolean }
      data.cancel = true
    })
    ctx.dealDamage({ sourceId: "t", targetId: "t", amount: 100, kind: "element", element: "burn" })
  })
  stopped.step()
  expect(unitOf(stopped, "t").elements).toEqual({})
  expect(unitOf(stopped, "t").attributes.hp).toBe(500)
  const stoppedEvents = stopped.drainEvents().map((event) => event.type)
  expect(stoppedEvents).toContain("element-hit")
  expect(stoppedEvents).not.toContain("damaged")
  expect(stoppedEvents).not.toContain("hit")
})

test("填槽不走闪避和首领限伤", () => {
  let randomHeld = false
  const battle = open(
    [ally("t", { attributes: { hp: 5000, dodgePhys: 1 }, hitLimit: true })],
    (ctx) => {
      const before = ctx.random.state()
      ctx.dealDamage({ sourceId: "t", targetId: "t", amount: 300000, kind: "element", element: "burn" })
      randomHeld = ctx.random.state() === before
    },
  )
  battle.step()
  expect(randomHeld).toBe(true)
  expect(unitOf(battle, "t").elements.burn).toBe(1000)
  expect(unitOf(battle, "t").attributes.hp).toBe(3800)
})
