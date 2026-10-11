import { expect, test } from "vitest"
import { blockModule, createBattle, type ContentContext, type MissionModule, type UnitSpec } from "arknights-mission-core"
import { ally, spec } from "#test/fixture.js"

const lane = [0, 1, 2, 3, 4].map((x) => ({ x, y: 0, height: 0, deployable: true, walkableBy: ["ground"] }))

/** 每一拍开头按拍数跑一段脚本。 */
function script(steps: Readonly<Record<number, (ctx: ContentContext) => void>>): MissionModule {
  return {
    id: "script",
    install(ctx) {
      ctx.registerSystem({
        id: "script",
        slot: "schedule",
        priority: 0,
        run(runCtx) {
          steps[runCtx.tick()]?.(runCtx)
        },
      })
    },
  }
}

function open(units: UnitSpec[], steps: Readonly<Record<number, (ctx: ContentContext) => void>> = {}) {
  return createBattle(spec({ modules: ["block", "script"], tiles: lane, units }), [blockModule, script(steps)])
}

function enemy(id: string, x: number, patch: Partial<UnitSpec> = {}): UnitSpec {
  return ally(id, { side: "enemy", x, y: 0, attributes: { hp: 50, moveSpeed: 0, blockWeight: 1 }, ...patch })
}

function unitOf(battle: ReturnType<typeof open>, id: string) {
  return battle.snapshot().units.find((unit) => unit.id === id)
}

function run(battle: ReturnType<typeof open>, steps: number): void {
  for (let index = 0; index < steps; index += 1) battle.step()
}

test("沉睡的敌人立刻放开，原地不动，阻挡位让给下一个；醒来没有空位时不再被挡", () => {
  const battle = open([ally("a"), enemy("first", 0.3), enemy("second", 0.4)], {
    1: (ctx) => ctx.applyStatus("first", "sleep", { duration: 1 }),
  })
  battle.step()
  expect(unitOf(battle, "a")?.blocking).toEqual(["first"])
  battle.step()
  expect(unitOf(battle, "first")).toMatchObject({ blockedBy: null, x: 0.3 })
  expect(unitOf(battle, "second")?.blockedBy).toBe("a")
  expect(unitOf(battle, "a")?.blocking).toEqual(["second"])
  run(battle, 40)
  expect(unitOf(battle, "first")?.tags).not.toContain("sleep")
  expect(unitOf(battle, "first")?.blockedBy).toBeNull()
  expect(unitOf(battle, "a")?.blocking).toEqual(["second"])
})

test("沉睡期间有空位也不被挡，醒来在原地重新被挡", () => {
  const battle = open([ally("a", { attributes: { hp: 100, blockCnt: 2 } }), enemy("e", 0.3)], {
    0: (ctx) => ctx.applyStatus("e", "sleep", { duration: 1 }),
  })
  run(battle, 20)
  expect(unitOf(battle, "e")).toMatchObject({ blockedBy: null, x: 0.3 })
  expect(unitOf(battle, "a")?.blocking).toEqual([])
  run(battle, 20)
  expect(unitOf(battle, "e")).toMatchObject({ blockedBy: "a", x: 0.3 })
})

test("被挡的敌人沉睡后放开；眩晕或免疫沉睡的敌人仍被挡着", () => {
  const battle = open(
    [
      ally("a", { attributes: { hp: 100, blockCnt: 3 } }),
      enemy("asleep", 0.3),
      enemy("stunned", 0.3),
      enemy("immune", 0.3, { immunity: ["sleep"] }),
    ],
    {
      1: (ctx) => {
        ctx.applyStatus("asleep", "sleep", { duration: 2 })
        ctx.applyStatus("stunned", "stun", { duration: 2 })
        ctx.applyStatus("immune", "sleep", { duration: 2 })
      },
    },
  )
  battle.step()
  expect(unitOf(battle, "a")?.blocking).toEqual(["asleep", "stunned", "immune"])
  battle.step()
  expect(unitOf(battle, "asleep")?.blockedBy).toBeNull()
  expect(unitOf(battle, "stunned")?.blockedBy).toBe("a")
  expect(unitOf(battle, "immune")?.blockedBy).toBe("a")
  expect(unitOf(battle, "a")?.blocking).toEqual(["stunned", "immune"])
})

function reblockWhileHeld(held: "freeze" | "stun"): void {
  const units = [enemy("plain", 1.2), enemy("hidden", 3.2)]
  const battle = open(units, {
    0: (ctx) => {
      ctx.applyStatus("plain", held, { duration: 3 })
      ctx.applyStatus("hidden", held, { duration: 3 })
      ctx.applyStatus("hidden", "stealth")
    },
    5: (ctx) => {
      ctx.spawnUnit(ally("a", { x: 1, y: 0 }))
      ctx.spawnUnit(ally("b", { x: 3, y: 0 }))
    },
  })
  run(battle, 5)
  expect(unitOf(battle, "plain")?.blockedBy).toBeNull()
  battle.step()
  expect(unitOf(battle, "plain")?.tags).toContain(held)
  expect(unitOf(battle, "plain")?.blockedBy).toBe("a")
  expect(unitOf(battle, "hidden")?.blockedBy).toBe("b")
  expect(unitOf(battle, "hidden")?.tags).toContain("stealth")
}

test("freeze 中的敌人旁边新放下的干员当场挡住它，挡住后隐匿的敌人能被打到", () => reblockWhileHeld("freeze"))

test("stun 中的敌人旁边新放下的干员当场挡住它，挡住后隐匿的敌人能被打到", () => reblockWhileHeld("stun"))

test("只看接触：没走到阻挡者跟前就被眩晕的敌人不被挡，之后走到同一位置被挡", () => {
  const route = { checkpoints: [], end: { x: 4, y: 0 } }
  const walker = (id: string, y: number) =>
    enemy(id, 0, { y, attributes: { hp: 50, moveSpeed: 1, blockWeight: 1 }, route })
  const battle = open([ally("a", { x: 3, y: 0, attributes: { hp: 100, blockCnt: 2 } }), walker("stunned", 0), walker("plain", 0)], {
    3: (ctx) => ctx.applyStatus("stunned", "stun", { duration: 0.5 }),
  })
  run(battle, 10)
  expect(unitOf(battle, "stunned")?.blockedBy).toBeNull()
  run(battle, 200)
  const stunned = unitOf(battle, "stunned")
  const plain = unitOf(battle, "plain")
  expect(stunned?.blockedBy).toBe("a")
  expect(plain?.blockedBy).toBe("a")
  expect(stunned?.x).toBeCloseTo(plain?.x ?? Number.NaN, 6)
})

function blockWhenSlotFrees(held: "bind" | "stun" | "freeze"): void {
  const battle = open([ally("a"), enemy("first", 0.3), enemy("held", 0.4)], {
    0: (ctx) => ctx.applyStatus("held", held, { duration: 5 }),
    3: (ctx) => ctx.loseHp("first", 1000),
  })
  run(battle, 3)
  expect(unitOf(battle, "held")?.blockedBy).toBeNull()
  battle.step()
  expect(unitOf(battle, "held")?.tags).toContain(held)
  expect(unitOf(battle, "held")?.blockedBy).toBe("a")
}

test("被 bind 定在满员阻挡者旁的敌人，空位一出就被挡住", () => blockWhenSlotFrees("bind"))

test("被 stun 定在满员阻挡者旁的敌人，空位一出就被挡住", () => blockWhenSlotFrees("stun"))

test("被 freeze 定在满员阻挡者旁的敌人，空位一出就被挡住", () => blockWhenSlotFrees("freeze"))

test("沉睡、浮空、恐惧加冻结、不可阻挡加眩晕的敌人，旁边新放下的有空位干员也挡不住", () => {
  const battle = open(
    [enemy("asleep", 1.2), enemy("levitated", 1.25), enemy("feared", 1.3), enemy("unblockable", 1.35)],
    {
      0: (ctx) => {
        ctx.applyStatus("asleep", "sleep", { duration: 3 })
        ctx.applyStatus("levitated", "levitate", { duration: 3 })
        ctx.applyStatus("feared", "fear", { duration: 3 })
        ctx.applyStatus("feared", "freeze", { duration: 3 })
        ctx.applyStatus("unblockable", "unblockable", { duration: 3 })
        ctx.applyStatus("unblockable", "stun", { duration: 3 })
      },
      2: (ctx) => ctx.spawnUnit(ally("a", { x: 1, y: 0, attributes: { hp: 100, blockCnt: 4 } })),
    },
  )
  run(battle, 4)
  expect(unitOf(battle, "a")?.blocking).toEqual([])
  for (const id of ["asleep", "levitated", "feared", "unblockable"]) expect(unitOf(battle, id)?.blockedBy).toBeNull()
})
