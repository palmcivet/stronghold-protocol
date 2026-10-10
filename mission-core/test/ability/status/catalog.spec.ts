import { expect, test } from "vitest"
import { createBattle, TICK, type ContentContext, type MissionModule, type UnitSpec } from "arknights-mission-core"
import { ally, spec } from "#test/fixture.js"

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

function flagsOf(battle: ReturnType<typeof createBattle>, id: string): readonly string[] {
  return battle.snapshot().units.find((unit) => unit.id === id)?.flags ?? []
}

function swing(ctx: ContentContext, unitId: string): void {
  ctx.startTimer(unitId, "attack")
  for (let step = 0; step < 80; step += 1) {
    const before = String(ctx.timerView(unitId, "attack").phase)
    ctx.advanceTimer(unitId, "attack")
    if (!ctx.timerView(unitId, "attack").started) return
    const after = String(ctx.timerView(unitId, "attack").phase)
    if (after === "recovery" && before !== "recovery") return
  }
}

test("目录状态写上对应旗标", () => {
  const battle = open([ally("a")], (ctx) => {
    ctx.applyStatus("a", "stun")
    ctx.applyStatus("a", "sleep")
    ctx.applyStatus("a", "bind")
    ctx.applyStatus("a", "stealth")
    ctx.applyStatus("a", "camou")
    ctx.applyStatus("a", "liftoff")
    ctx.applyStatus("a", "isolated")
    ctx.applyStatus("a", "fear")
    ctx.applyStatus("a", "levitate")
  })
  battle.step()
  expect(flagsOf(battle, "a")).toEqual([
    "bind",
    "camou",
    "fear",
    "isolated",
    "levitate",
    "liftoff",
    "noBlock",
    "noDisplace",
    "noMove",
    "sleep",
    "stealth",
    "stun",
    "unblockable",
  ])
})

test("飞行单位不被浮空，地面单位会被浮空", () => {
  const battle = open(
    [ally("ground"), ally("flyer", { motion: "FLY" })],
    (ctx) => {
      ctx.applyStatus("ground", "levitate")
      ctx.applyStatus("flyer", "levitate")
    },
  )
  battle.step()
  expect(flagsOf(battle, "ground")).toEqual(["levitate", "noDisplace", "stun", "unblockable"])
  expect(flagsOf(battle, "flyer")).toEqual([])
})

test("第二次寒冷还在身上时施加冻结，单位免疫 frozen 则跳过", () => {
  const openCold = open([ally("a"), ally("b")], (ctx) => {
    ctx.applyStatus("a", "cold")
    ctx.applyStatus("b", "cold")
    ctx.applyStatus("b", "cold")
  })
  openCold.step()
  expect(flagsOf(openCold, "a")).toEqual(["cold"])
  expect(flagsOf(openCold, "b")).toEqual(["cold", "freeze", "stun"])

  const immune = open([ally("a", { immunity: ["frozen"] })], (ctx) => {
    ctx.applyStatus("a", "cold")
    ctx.applyStatus("a", "cold")
  })
  immune.step()
  expect(flagsOf(immune, "a")).not.toContain("freeze")
  expect(flagsOf(immune, "a")).toContain("cold")
})

test("冻结只降低敌人的法术抗性", () => {
  const battle = open(
    [
      ally("enemy", { side: "enemy", attributes: { hp: 200, res: 50 } }),
      ally("friend", { attributes: { hp: 200, res: 50 } }),
    ],
    (ctx) => {
      ctx.applyStatus("enemy", "freeze")
      ctx.applyStatus("friend", "freeze")
      ctx.dealDamage({ sourceId: "friend", targetId: "enemy", amount: 100, kind: "arts" })
      ctx.dealDamage({ sourceId: "enemy", targetId: "friend", amount: 100, kind: "arts" })
    },
  )
  battle.step()
  const units = battle.snapshot().units
  expect(units.find((unit) => unit.id === "enemy")?.attributes.hp).toBe(135)
  expect(units.find((unit) => unit.id === "friend")?.attributes.hp).toBe(150)
})

test("脆弱和元素脆弱使用默认倍率", () => {
  const battle = open([ally("a", { attributes: { hp: 200 } }), ally("b", { attributes: { hp: 200 } })], (ctx) => {
    ctx.applyStatus("a", "fragile")
    ctx.applyStatus("b", "elemFragile")
    ctx.dealDamage({ sourceId: "a", targetId: "a", amount: 100, kind: "true" })
    ctx.dealDamage({ sourceId: "b", targetId: "b", amount: 100, kind: "elemental" })
  })
  battle.step()
  const units = battle.snapshot().units
  expect(units.find((unit) => unit.id === "a")?.attributes.hp).toBe(70)
  expect(units.find((unit) => unit.id === "b")?.attributes.hp).toBe(80)
})

test("眩晕和缴械取消攻击", () => {
  const hits: string[] = []
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
          runCtx.startTimer("stun", "attack")
          runCtx.startTimer("disarm", "attack")
          runCtx.startTimer("open", "attack")
        },
      })
      ctx.registerSystem({
        id: "apply",
        slot: "status",
        priority: -1,
        run(runCtx) {
          runCtx.applyStatus("stun", "stun")
          runCtx.applyStatus("disarm", "disarm")
        },
      })
    },
  }
  const battle = createBattle(
    spec({
      modules: ["case"],
      units: [ally("stun"), ally("disarm"), ally("open"), ally("foe", { side: "enemy", x: 1, y: 0 })],
    }),
    [module],
  )
  battle.step()
  battle.step()
  battle.step()
  expect(hits).toEqual(["open"])
  expect(flagsOf(battle, "stun")).toEqual(["noBlock", "stun"])
  expect(flagsOf(battle, "disarm")).toEqual(["disarm"])
})

test("战栗的敌人被挡住时不出手，没被挡时照常打", () => {
  const hits: string[] = []
  const tile = { height: 0, deployable: true, walkableBy: ["ground"] }
  const battle = createBattle(
    spec({
      modules: ["case"],
      tiles: [
        { ...tile, x: 0, y: 0 },
        { ...tile, x: 1, y: 0 },
        { ...tile, x: 0, y: 1 },
        { ...tile, x: 1, y: 1 },
      ],
      units: [
        ally("held", {
          side: "enemy",
          x: 0,
          y: 0,
          facing: "RIGHT",
          blockedBy: "a",
          attributes: { hp: 100, atk: 10, def: 0 },
        }),
        ally("free", {
          side: "enemy",
          x: 0,
          y: 1,
          facing: "RIGHT",
          attributes: { hp: 100, atk: 10, def: 0 },
        }),
        ally("a", { x: 1, y: 0, facing: "LEFT", attributes: { hp: 500, atk: 0, def: 0 } }),
        ally("b", { x: 1, y: 1, facing: "LEFT", attributes: { hp: 500, atk: 0, def: 0 } }),
      ],
    }),
    [
      {
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
              runCtx.applyStatus("held", "tremble")
              runCtx.applyStatus("free", "tremble")
              runCtx.startTimer("held", "attack")
              runCtx.startTimer("free", "attack")
            },
          })
        },
      },
    ],
  )
  battle.step()
  expect(hits).toEqual(["free"])
  expect(flagsOf(battle, "held")).toEqual(["tremble"])
})

test("麻痹按层取消敌人普攻，第五层加不上去，友方不受影响", () => {
  const hits: string[] = []
  const battle = open(
    [
      ally("e", { side: "enemy", x: 0, y: 0, facing: "RIGHT", attributes: { hp: 100 } }),
      ally("a", { x: 1, y: 0, facing: "LEFT", attributes: { hp: 500 } }),
    ],
    (ctx) => {
    ctx.subscribe("attack-hit", (event) => {
      hits.push(String(event.data.unitId))
    })
    for (let count = 0; count < 5; count += 1) ctx.applyStatus("e", "palsy")
    ctx.applyStatus("a", "palsy")
    for (let count = 0; count < 4; count += 1) swing(ctx, "e")
    swing(ctx, "a")
  })
  battle.step()
  expect(hits).toEqual(["e", "a"])
})

test("敌人神经爆发叠 3 层麻痹，单位免疫 palsy 则一层都不加", () => {
  const hits: string[] = []
  const burst = open(
    [
      ally("e", { side: "enemy", x: 0, y: 0, facing: "RIGHT", attributes: { hp: 20000 } }),
      ally("mark", { x: 1, y: 0, attributes: { hp: 5000 } }),
    ],
    (ctx) => {
    ctx.subscribe("attack-hit", () => {
      hits.push("hit")
    })
    ctx.dealDamage({ sourceId: "e", targetId: "e", amount: 1000, kind: "element", element: "neural" })
    for (let count = 0; count < 4; count += 1) swing(ctx, "e")
  })
  burst.step()
  expect(hits).toEqual(["hit"])
  expect(burst.snapshot().units[0]?.attributes.palsy).toBeUndefined()

  const immuneHits: string[] = []
  const immune = open(
    [
      ally("e", { side: "enemy", x: 0, y: 0, facing: "RIGHT", attributes: { hp: 20000 }, immunity: ["palsy"] }),
      ally("mark", { x: 1, y: 0, attributes: { hp: 5000 } }),
    ],
    (ctx) => {
      ctx.subscribe("attack-hit", () => {
        immuneHits.push("hit")
      })
      ctx.dealDamage({ sourceId: "e", targetId: "e", amount: 1000, kind: "element", element: "neural" })
      swing(ctx, "e")
    },
  )
  immune.step()
  expect(immuneHits).toEqual(["hit"])
})

test("抵抗每 5 秒去掉 1 层麻痹", () => {
  const hits: string[] = []
  const module: MissionModule = {
    id: "case",
    install(ctx) {
      ctx.subscribe("attack-hit", () => {
        hits.push("hit")
      })
      ctx.registerSystem({
        id: "case",
        slot: "schedule",
        priority: 1,
        run(runCtx) {
          if (runCtx.tick() === 0) {
            runCtx.applyStatus("e", "palsy")
            runCtx.applyStatus("e", "resist")
            return
          }
          if (runCtx.tick() !== 150) return
          swing(runCtx, "e")
        },
      })
    },
  }
  const battle = createBattle(
    spec({
      modules: ["case"],
      units: [
        ally("e", { side: "enemy", x: 0, y: 0, facing: "RIGHT", attributes: { hp: 100 } }),
        ally("mark", { x: 1, y: 0, attributes: { hp: 5000 } }),
      ],
    }),
    [module],
  )
  for (let step = 0; step < 151; step += 1) battle.step()
  expect(hits).toEqual(["hit"])
})

test("施加可以带秒数，到时消失；0 秒不施加", () => {
  const timed = open([ally("a")], (ctx) => {
    ctx.applyStatus("a", "stun", { duration: 2 * TICK })
  })
  timed.step()
  expect(flagsOf(timed, "a")).toContain("stun")
  timed.step()
  expect(flagsOf(timed, "a")).not.toContain("stun")

  const refused = open([ally("a")], (ctx) => {
    ctx.applyStatus("a", "stun", { duration: 0 })
  })
  refused.step()
  expect(flagsOf(refused, "a")).not.toContain("stun")
})

test("脆弱用这次的强度，弱的不盖过强的，强的结束后续上弱的", () => {
  const battle = open([ally("a", { attributes: { hp: 500 } })], (ctx) => {
    if (ctx.tick() !== 0) return
    ctx.applyStatus("a", "fragile", { value: 0.5, duration: 2 * TICK })
    ctx.applyStatus("a", "fragile", { value: 0.2, duration: 1 })
    ctx.dealDamage({ sourceId: "a", targetId: "a", amount: 100, kind: "true" })
  })
  battle.step()
  expect(battle.snapshot().units[0]?.attributes.hp).toBe(350)
  battle.step()
  const later: MissionModule = {
    id: "later",
    install(ctx) {
      ctx.registerSystem({
        id: "later",
        slot: "schedule",
        priority: 2,
        run(runCtx) {
          if (runCtx.tick() !== 2) return
          runCtx.dealDamage({ sourceId: "a", targetId: "a", amount: 100, kind: "true" })
        },
      })
    },
  }
  const resumed = createBattle(
    spec({
      modules: ["case", "later"],
      units: [ally("a", { attributes: { hp: 500 } })],
    }),
    [
      {
        id: "case",
        install(ctx) {
          ctx.registerSystem({
            id: "case",
            slot: "schedule",
            priority: 1,
            run(runCtx) {
              if (runCtx.tick() !== 0) return
              runCtx.applyStatus("a", "fragile", { value: 0.5, duration: 2 * TICK })
              runCtx.applyStatus("a", "fragile", { value: 0.2, duration: 1 })
            },
          })
        },
      },
      later,
    ],
  )
  resumed.step()
  resumed.step()
  resumed.step()
  expect(resumed.snapshot().units[0]?.attributes.hp).toBe(380)
})

test("恐惧免疫用 feared", () => {
  const battle = open([ally("a", { immunity: ["feared"] })], (ctx) => {
    ctx.applyStatus("a", "fear")
    ctx.applyStatus("a", "tremble")
  })
  battle.step()
  expect(flagsOf(battle, "a")).toEqual([])
})
