import { describe, expect, test } from "vitest"
import { createBattle, type BattleEvent, type ContentContext, type MissionModule, type UnitSpec } from "arknights-mission-core"
import { ally, spec } from "#test/fixture.js"

const HP = 1_000_000

/** 一个打开首领限伤的单位 t 与一个没打开的单位 m，第 0 拍执行 run。 */
function open(run: (ctx: ContentContext) => void, units: UnitSpec[] = []): { battle: ReturnType<typeof createBattle>; events: readonly BattleEvent[] } {
  const module: MissionModule = {
    id: "case",
    install(ctx) {
      ctx.registerSystem({
        id: "case",
        slot: "schedule",
        priority: 1,
        run(runCtx) {
          if (runCtx.tick() === 0) run(runCtx)
        },
      })
    },
  }
  const battle = createBattle(
    spec({
      modules: ["case"],
      units: [
        ally("t", { side: "enemy", attributes: { hp: HP, def: 0, res: 0 }, hitLimit: true }),
        ally("m", { side: "enemy", x: 1, attributes: { hp: HP, def: 0, res: 0 } }),
        ally("s", { attributes: { hp: 100, atk: 0 } }),
        ...units,
      ],
    }),
    [module],
  )
  battle.step()
  return { battle, events: battle.drainEvents() }
}

function hpOf(battle: ReturnType<typeof createBattle>, id = "t"): number {
  return battle.snapshot().units.find((unit) => unit.id === id)?.attributes.hp ?? Number.NaN
}

function shieldOf(battle: ReturnType<typeof createBattle>, id = "t"): number {
  return battle.snapshot().units.find((unit) => unit.id === id)?.attributes.shield ?? 0
}

describe("首领限伤", () => {
  test("看的是向上取整后的最终伤害：299999.2 算到线上被取消，299999 照常扣", () => {
    const over = open((ctx) => ctx.dealDamage({ sourceId: "s", targetId: "t", amount: 299999.2, kind: "true" }))
    expect(hpOf(over.battle)).toBe(HP)
    const under = open((ctx) => ctx.dealDamage({ sourceId: "s", targetId: "t", amount: 299999, kind: "true" }))
    expect(hpOf(under.battle)).toBe(HP - 299999)
  })

  test("看的是减防与乘算之后的数额：减防后落到线下的一击照常扣，乘算后到线的一击取消", () => {
    const reduced = open((ctx) => {
      ctx.setModifier("t", "armor", [{ attribute: "def", op: "add", value: 1000 }])
      ctx.dealDamage({ sourceId: "s", targetId: "t", amount: 300999, kind: "physical" })
    })
    expect(hpOf(reduced.battle)).toBe(HP - 299999)
    const taken = open((ctx) => {
      ctx.setModifier("t", "fragile", [{ attribute: "dmgTaken", op: "mul", value: 2 }])
      ctx.dealDamage({ sourceId: "s", targetId: "t", amount: 150000, kind: "true" })
    })
    expect(hpOf(taken.battle)).toBe(HP)
  })

  test("在护盾之前判定：取消的一击不动护盾，低于线的一击照常先扣护盾", () => {
    const shielded = (amount: number) =>
      open(
        (ctx) => ctx.dealDamage({ sourceId: "s", targetId: "w", amount, kind: "true" }),
        [ally("w", { side: "enemy", x: 2, attributes: { hp: HP, shield: 1000 }, hitLimit: true })],
      )
    const cancelled = shielded(300000)
    expect(shieldOf(cancelled.battle, "w")).toBe(1000)
    expect(hpOf(cancelled.battle, "w")).toBe(HP)
    const absorbed = shielded(500)
    expect(shieldOf(absorbed.battle, "w")).toBe(500)
    expect(hpOf(absorbed.battle, "w")).toBe(HP)
  })

  test("每一种生命伤害都判定：元素伤害与流失到线时取消；元素损伤不是生命伤害，照常进槽并爆发", () => {
    const elemental = open((ctx) => ctx.dealDamage({ sourceId: "s", targetId: "t", amount: 300000, kind: "elemental" }))
    expect(hpOf(elemental.battle)).toBe(HP)
    const lost = open((ctx) => ctx.loseHp("t", 300000))
    expect(hpOf(lost.battle)).toBe(HP)
    const gauge = open((ctx) => ctx.dealDamage({ sourceId: "s", targetId: "t", amount: 300000, kind: "element", element: "burn" }))
    expect(gauge.events.some((event) => event.type === "element-hit" && event.data.targetId === "t")).toBe(true)
    expect(gauge.events.some((event) => event.type === "element-burst")).toBe(true)
    expect(hpOf(gauge.battle)).toBe(HP - 7000)
  })

  test("取消之前的 hit 照常发出，之后的 damaged 与击倒都没有；没打开限伤的单位同一击照常扣", () => {
    const { battle, events } = open((ctx) => {
      ctx.dealDamage({ sourceId: "s", targetId: "t", amount: HP, kind: "true" })
      ctx.dealDamage({ sourceId: "s", targetId: "m", amount: 300000, kind: "true" })
    })
    expect(events.some((event) => event.type === "hit" && event.data.targetId === "t")).toBe(true)
    expect(events.some((event) => event.type === "damaged" && event.data.targetId === "t")).toBe(false)
    expect(events.some((event) => event.type === "downed" && event.data.unitId === "t")).toBe(false)
    expect(hpOf(battle)).toBe(HP)
    expect(hpOf(battle, "m")).toBe(HP - 300000)
  })
})
