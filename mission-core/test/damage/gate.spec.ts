import { expect, test } from "vitest"
import { createBattle, type ContentContext, type MissionModule, type UnitSpec } from "arknights-mission-core"
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

function hpOf(battle: ReturnType<typeof createBattle>, id: string): number {
  return battle.snapshot().units.find((unit) => unit.id === id)?.attributes.hp ?? Number.NaN
}

const counted = {
  id: "counted",
  flags: ["hitCount"],
  modifiers: [],
  immunity: [],
  stackCap: 1,
  cancels: [],
  duration: 0,
}

test("无敌和沉睡挡在命中之前，流失仍然扣生命", () => {
  const types: string[] = []
  const battle = open([ally("t", { attributes: { hp: 100 } })], (ctx) => {
    ctx.subscribe("hit", (event) => {
      types.push(event.type)
    })
    ctx.subscribe("damaged", (event) => {
      types.push(event.type)
    })
    ctx.subscribe("elementHit", (event) => {
      types.push(event.type)
    })
    ctx.applyStatus("t", "invulnerable")
    ctx.dealDamage({ sourceId: "t", targetId: "t", amount: 40, kind: "physical" })
    ctx.dealDamage({ sourceId: "t", targetId: "t", amount: 20, kind: "element", element: "burn" })
    ctx.loseHp("t", 5)
  })
  battle.step()
  expect(hpOf(battle, "t")).toBe(95)
  expect(battle.snapshot().units[0]?.elements).toEqual({})
  expect(types).toEqual([])
})

test("沉睡挡住伤害和元素槽，能打沉睡或这一击声明忽略时除外", () => {
  const battle = open(
    [ally("s", { attributes: { hp: 50 } }), ally("t", { attributes: { hp: 100 } })],
    (ctx) => {
      ctx.applyStatus("s", "awake")
      ctx.applyStatus("t", "sleep")
      ctx.dealDamage({ sourceId: "s", targetId: "t", amount: 40, kind: "physical" })
      ctx.dealDamage({ sourceId: "t", targetId: "t", amount: 10, kind: "element", element: "burn" })
      ctx.dealDamage({ sourceId: "t", targetId: "t", amount: 30, kind: "true", ignoreSleep: true })
    },
    (ctx) => {
      ctx.registerStatus({
        id: "awake",
        flags: ["hitSleep"],
        modifiers: [],
        immunity: [],
        stackCap: 1,
        cancels: [],
        duration: 0,
      })
    },
  )
  battle.step()
  expect(hpOf(battle, "t")).toBe(30)
  expect(battle.snapshot().units.find((unit) => unit.id === "t")?.elements).toEqual({})
})

test("没有例外时沉睡不受伤", () => {
  const battle = open([ally("t", { attributes: { hp: 100 } })], (ctx) => {
    ctx.applyStatus("t", "sleep")
    ctx.dealDamage({ sourceId: "t", targetId: "t", amount: 40, kind: "physical" })
  })
  battle.step()
  expect(hpOf(battle, "t")).toBe(100)
})

test("地面敌人打不到起飞的干员，飞行、无来源和忽略选择打得到", () => {
  const battle = open(
    [
      ally("t", { attributes: { hp: 200 } }),
      ally("ground", { side: "enemy", attributes: { hp: 50 } }),
      ally("flyer", { side: "enemy", motion: "FLY", attributes: { hp: 50 } }),
      ally("lifted", { side: "enemy", attributes: { hp: 50 } }),
    ],
    (ctx) => {
      ctx.applyStatus("t", "liftoff")
      ctx.applyStatus("lifted", "levitate")
      ctx.dealDamage({ sourceId: "ground", targetId: "t", amount: 30, kind: "physical" })
      ctx.dealDamage({ sourceId: "ground", targetId: "t", amount: 15, kind: "element", element: "burn" })
      ctx.dealDamage({ sourceId: "flyer", targetId: "t", amount: 10, kind: "true" })
      ctx.dealDamage({ sourceId: "lifted", targetId: "t", amount: 7, kind: "true" })
      ctx.dealDamage({
        sourceId: "ground",
        targetId: "t",
        amount: 4,
        kind: "true",
        sourceless: true,
      })
      ctx.dealDamage({
        sourceId: "ground",
        targetId: "t",
        amount: 3,
        kind: "true",
        ignoreSelect: true,
      })
    },
  )
  battle.step()
  expect(hpOf(battle, "t")).toBe(176)
  expect(battle.snapshot().units.find((unit) => unit.id === "t")?.elements).toEqual({})
})

test("命中回调里才起飞的伤害照常结算，回调里变成无敌则取消", () => {
  const landed = open([ally("t", { attributes: { hp: 100 } }), ally("e", { side: "enemy" })], (ctx) => {
    ctx.subscribe("hit", () => {
      ctx.applyStatus("t", "liftoff")
    })
    ctx.dealDamage({ sourceId: "e", targetId: "t", amount: 12, kind: "true" })
  })
  landed.step()
  expect(hpOf(landed, "t")).toBe(88)
  expect(landed.snapshot().units.find((unit) => unit.id === "t")?.flags).toContain("liftoff")

  const stopped = open([ally("t", { attributes: { hp: 100 } })], (ctx) => {
    ctx.subscribe("hit", () => {
      ctx.applyStatus("t", "invulnerable")
    })
    ctx.dealDamage({ sourceId: "t", targetId: "t", amount: 12, kind: "true" })
  })
  stopped.step()
  expect(hpOf(stopped, "t")).toBe(100)
})

test("受击次数每次扣 1 并跳过防御，闪避仍然先判定", () => {
  const battle = open(
    [ally("t", { attributes: { hp: 100, def: 80, shield: 10 } })],
    (ctx) => {
      ctx.applyStatus("t", "counted")
      ctx.dealDamage({ sourceId: "t", targetId: "t", amount: 400, kind: "physical" })
    },
    (ctx) => {
      ctx.registerStatus(counted)
    },
  )
  battle.step()
  const unit = battle.snapshot().units[0]
  expect(unit?.attributes.hp).toBe(100)
  expect(unit?.attributes.shield).toBe(9)

  const dodged = open(
    [ally("t", { attributes: { hp: 100, def: 0 } })],
    (ctx) => {
      ctx.applyStatus("t", "counted-dodge")
      ctx.dealDamage({ sourceId: "t", targetId: "t", amount: 400, kind: "physical" })
    },
    (ctx) => {
      ctx.registerStatus({
        ...counted,
        id: "counted-dodge",
        modifiers: [{ attribute: "dodgePhys", op: "add", value: 1 }],
      })
    },
  )
  dodged.step()
  expect(hpOf(dodged, "t")).toBe(100)

  const bare = open(
    [ally("t", { attributes: { hp: 100, def: 80 } })],
    (ctx) => {
      ctx.applyStatus("t", "counted")
      ctx.dealDamage({ sourceId: "t", targetId: "t", amount: 400, kind: "physical" })
    },
    (ctx) => {
      ctx.registerStatus(counted)
    },
  )
  bare.step()
  expect(hpOf(bare, "t")).toBe(99)
})

test("只数法术的受击次数放过物理", () => {
  const battle = open(
    [ally("t", { attributes: { hp: 100, res: 90 } })],
    (ctx) => {
      ctx.applyStatus("t", "arts-only")
      ctx.dealDamage({ sourceId: "t", targetId: "t", amount: 400, kind: "physical" })
      ctx.dealDamage({ sourceId: "t", targetId: "t", amount: 400, kind: "arts" })
    },
    (ctx) => {
      ctx.registerStatus({ ...counted, id: "arts-only", flags: ["hitCountArts"] })
    },
  )
  battle.step()
  expect(hpOf(battle, "t")).toBe(99)
})

test("预览对无敌给出 0，对受击次数给出 1", () => {
  let invulnerable = -1
  let countedPreview = -1
  const module: MissionModule = {
    id: "case",
    install(ctx) {
      ctx.registerStatus(counted)
      ctx.registerSystem({
        id: "case",
        slot: "schedule",
        priority: 1,
        run(runCtx) {
          runCtx.applyStatus("wall", "invulnerable")
          runCtx.applyStatus("hits", "counted")
          invulnerable = runCtx.previewDamage({
            sourceId: "wall",
            targetId: "wall",
            amount: 40,
            kind: "physical",
          }).amount
          countedPreview = runCtx.previewDamage({
            sourceId: "hits",
            targetId: "hits",
            amount: 400,
            kind: "physical",
          }).amount
        },
      })
    },
  }
  const battle = createBattle(
    spec({
      modules: ["case"],
      units: [ally("wall", { attributes: { hp: 100 } }), ally("hits", { attributes: { hp: 100, def: 80 } })],
    }),
    [module],
  )
  battle.step()
  expect(invulnerable).toBe(0)
  expect(countedPreview).toBe(1)
  expect(hpOf(battle, "wall")).toBe(100)
  expect(hpOf(battle, "hits")).toBe(100)
})
