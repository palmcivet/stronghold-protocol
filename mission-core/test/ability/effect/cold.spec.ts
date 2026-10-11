import { expect, test } from "vitest"
import { createBattle, type ContentContext, type MissionModule, type UnitSpec } from "arknights-mission-core"
import { ally, spec } from "#test/fixture.js"

type Plan = Readonly<Record<number, (ctx: ContentContext) => void>>

interface Run {
  /** 这个标签第一次不在身上时已经走过的拍数；一直在则是 steps + 1。 */
  endOf(unitId: string, tag: string): number
  tagsAt(step: number, unitId: string): readonly string[]
  readonly statuses: readonly string[]
  readonly res: number[]
}

function run(units: UnitSpec[], plan: Plan, steps: number): Run {
  const statuses: string[] = []
  const res: number[] = []
  const module: MissionModule = {
    id: "case",
    install(ctx) {
      ctx.subscribe("status", (event) => {
        statuses.push(`${String(event.data.unitId)}:${String(event.data.statusId)}`)
      })
      ctx.registerSystem({
        id: "plan",
        slot: "schedule",
        priority: 1,
        run(runCtx) {
          plan[runCtx.tick()]?.(runCtx)
        },
      })
      ctx.registerSystem({
        id: "read",
        slot: "finale",
        priority: 0,
        run(runCtx) {
          res.push(runCtx.attribute(units[0]?.id ?? "", "res"))
        },
      })
    },
  }
  const battle = createBattle(spec({ modules: ["case"], units }), [module])
  const seen: (readonly { id: string; tags: readonly string[] }[])[] = []
  for (let step = 0; step < steps; step += 1) {
    battle.step()
    seen.push(battle.snapshot().units.map((unit) => ({ id: unit.id, tags: unit.tags })))
  }
  const tagsAt = (step: number, unitId: string): readonly string[] =>
    seen[step - 1]?.find((unit) => unit.id === unitId)?.tags ?? []
  return {
    tagsAt,
    endOf(unitId, tag) {
      for (let step = steps; step >= 1; step -= 1) if (tagsAt(step, unitId).includes(tag)) return step + 1
      return 0
    },
    statuses,
    res,
  }
}

function target(patch: Partial<UnitSpec> = {}): UnitSpec {
  return ally("e", { side: "enemy", attributes: { hp: 1e6, atk: 0, def: 0, res: 30 }, attackRange: [], ...patch })
}

test("寒冷 10 秒后紧接 1 秒寒冷：冻结取更长的 10 秒，这对寒冷变成冻结，冻结中法抗 −15", () => {
  const result = run(
    [target()],
    {
      0: (ctx) => {
        ctx.applyEffect("e", "cold", { duration: 10 })
        ctx.applyEffect("e", "cold", { duration: 1 })
      },
    },
    320,
  )
  expect(result.tagsAt(1, "e")).toEqual(["freeze", "stun"])
  expect(result.endOf("e", "freeze")).toBe(300)
  expect(result.res[0]).toBe(15)
  expect(result.res[310]).toBe(30)
  expect(result.statuses).toEqual(["e:cold", "e:freeze"])
})

test("寒冷 1 秒后接 8 秒寒冷：冻结 8 秒", () => {
  const result = run(
    [target()],
    {
      0: (ctx) => {
        ctx.applyEffect("e", "cold", { duration: 1 })
        ctx.applyEffect("e", "cold", { duration: 8 })
      },
    },
    260,
  )
  expect(result.tagsAt(1, "e")).not.toContain("cold")
  expect(result.endOf("e", "freeze")).toBe(240)
})

test("较短的第二次寒冷不缩短剩余更长的寒冷给出的冻结", () => {
  const result = run(
    [target()],
    {
      0: (ctx) => ctx.applyEffect("e", "cold", { duration: 10 }),
      180: (ctx) => ctx.applyEffect("e", "cold", { duration: 1 }),
    },
    320,
  )
  expect(result.tagsAt(181, "e")).toEqual(["freeze", "stun"])
  expect(result.endOf("e", "freeze")).toBe(300)
})

test("抵抗先缩短这次寒冷再取更长的，冻结不再被抵抗缩短一次", () => {
  const result = run(
    [target()],
    {
      0: (ctx) => {
        ctx.applyEffect("e", "cold", { duration: 2 })
        ctx.applyEffect("e", "resist", { value: 0.5 })
        ctx.applyEffect("e", "cold", { duration: 10 })
      },
    },
    320,
  )
  expect(result.endOf("e", "freeze")).toBe(150)
  expect(result.statuses.filter((entry) => entry === "e:freeze")).toHaveLength(1)
})

test("免疫冻结的敌人吃下第二次寒冷，寒冷取更长的时长，不冻结", () => {
  const result = run(
    [target({ immunity: ["frozen"] })],
    {
      0: (ctx) => {
        ctx.applyEffect("e", "cold", { duration: 10 })
        ctx.applyEffect("e", "cold", { duration: 1 })
      },
    },
    320,
  )
  expect(result.tagsAt(1, "e")).toEqual(["cold"])
  expect(result.endOf("e", "cold")).toBe(300)
})

test("友方的两次寒冷照样冻结，寒冷留在身上", () => {
  const result = run(
    [ally("a", { attackRange: [] })],
    {
      0: (ctx) => {
        ctx.applyEffect("a", "cold", { duration: 10 })
        ctx.applyEffect("a", "cold", { duration: 1 })
      },
    },
    10,
  )
  expect(result.tagsAt(1, "a")).toEqual(["cold", "freeze", "stun"])
})

test("同名控制效果再次施加时取剩余与这次中更长的", () => {
  const result = run(
    [target()],
    {
      0: (ctx) => {
        ctx.applyEffect("e", "stun", { duration: 5 })
        ctx.applyEffect("e", "stun", { duration: 1 })
      },
    },
    200,
  )
  expect(result.endOf("e", "stun")).toBe(150)
})
