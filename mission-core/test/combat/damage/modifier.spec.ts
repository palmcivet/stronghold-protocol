import { expect, test } from "vitest"
import { createBattle, type ContentContext, type HpChange, type MissionModule, type UnitSpec } from "arknights-mission-core"
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
          if (runCtx.tick() === 0) run(runCtx)
        },
      })
    },
  }
  return createBattle(spec({ modules: ["case"], units }), [module])
}

function hpOf(battle: ReturnType<typeof createBattle>): number {
  return battle.snapshot().units[0]?.attributes.hp ?? Number.NaN
}

const target = (): UnitSpec[] => [ally("t", { attributes: { hp: 10000, shield: 300 } })]

test("hp 阶段在护盾之后、扣生命之前：修饰看到穿过护盾的数额，只能调低，调高不生效", () => {
  const seen: [number, string, string][] = []
  const lowered = open(target(), (ctx) => {
    ctx.dealDamage({ sourceId: "t", targetId: "t", amount: 1000, kind: "true" })
  }, (ctx) => {
    ctx.registerDamageModifier({
      id: "floor",
      stage: "hp",
      priority: 0,
      modify(change: HpChange) {
        seen.push([change.amount, change.creditId, change.kind])
        change.amount = Math.min(change.amount, 100)
      },
    })
  })
  lowered.step()
  expect(seen).toEqual([[700, "t", "true"]])
  expect(lowered.snapshot().units[0]?.attributes.shield).toBe(0)
  expect(hpOf(lowered)).toBe(9900)
  const damaged = lowered.drainEvents().find((event) => event.type === "damaged")
  expect(damaged?.type === "damaged" ? damaged.data.amount : -1).toBe(100)

  const raised = open([ally("t", { attributes: { hp: 10000 } })], (ctx) => {
    ctx.dealDamage({ sourceId: "t", targetId: "t", amount: 50, kind: "true" })
  }, (ctx) => {
    ctx.registerDamageModifier({ id: "raise", stage: "hp", priority: 0, modify: (change) => void (change.amount = 1e9) })
    ctx.registerDamageModifier({ id: "nan", stage: "hp", priority: 1, modify: (change) => void (change.amount = Number.NaN) })
    ctx.registerDamageModifier({ id: "negative", stage: "hp", priority: 2, modify: (change) => void (change.amount = -20) })
  })
  raised.step()
  expect(hpOf(raised)).toBe(10000)
})

test("hp 阶段的修饰按 priority 依次调低，后一个看到前一个的结果", () => {
  const seen: number[] = []
  const battle = open([ally("t", { attributes: { hp: 1000 } })], (ctx) => {
    ctx.dealDamage({ sourceId: "t", targetId: "t", amount: 500, kind: "true" })
  }, (ctx) => {
    ctx.registerDamageModifier({ id: "second", stage: "hp", priority: 2, modify: (change) => void seen.push(change.amount) })
    ctx.registerDamageModifier({ id: "first", stage: "hp", priority: 1, modify: (change) => void (change.amount = 200) })
  })
  battle.step()
  expect(seen).toEqual([200])
  expect(hpOf(battle)).toBe(800)
})

test("流失与被护盾整段吸收的伤害不经过 hp 阶段；没有修饰时照常结算", () => {
  let calls = 0
  const battle = open([ally("t", { attributes: { hp: 1000, shield: 500 } })], (ctx) => {
    ctx.loseHp("t", 100)
    ctx.dealDamage({ sourceId: "t", targetId: "t", amount: 200, kind: "true" })
    expect(calls).toBe(0)
    ctx.dealDamage({ sourceId: "t", targetId: "t", amount: 400, kind: "true" })
    expect(calls).toBe(1)
  }, (ctx) => {
    ctx.registerDamageModifier({ id: "count", stage: "hp", priority: 0, modify: () => void (calls += 1) })
  })
  battle.step()
  expect(hpOf(battle)).toBe(800)

  const plain = open([ally("t", { attributes: { hp: 1000 } })], (ctx) => {
    ctx.dealDamage({ sourceId: "t", targetId: "t", amount: 250, kind: "true" })
  })
  plain.step()
  expect(hpOf(plain)).toBe(750)
})
