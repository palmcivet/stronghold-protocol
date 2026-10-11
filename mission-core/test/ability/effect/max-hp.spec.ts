import { expect, test } from "vitest"
import { createBattle, defineEffect, type ContentContext, type MissionModule } from "arknights-mission-core"
import { ally, spec } from "#test/fixture.js"

type Plan = Readonly<Record<number, (ctx: ContentContext) => void>>

const double = defineEffect("case-double", { modifiers: [{ attribute: "maxHp", op: "percent", value: 1 }] })

function open(plan: Plan, hp = 500) {
  const module: MissionModule = {
    id: "case",
    install(ctx) {
      ctx.registerEffect(double)
      ctx.registerSystem({ id: "plan", slot: "schedule", priority: 1, run: (runCtx) => plan[runCtx.tick()]?.(runCtx) })
    },
  }
  const battle = createBattle(
    spec({ modules: ["case"], units: [ally("u", { attackRange: [], attributes: { hp, maxHp: 1000, atk: 0, def: 0 } })] }),
    [module],
  )
  const hpOf = () => battle.snapshot().units.find((unit) => unit.id === "u")?.attributes.hp
  return { battle, hpOf }
}

test("最大生命翻倍时当前生命跟着翻倍，效果取下时按比例回落；拍内一读到就已经跟上", () => {
  const seen: number[] = []
  const { battle, hpOf } = open({
    1: (ctx) => {
      ctx.applyEffect("u", "case-double")
      seen.push(ctx.attribute("u", "maxHp"), ctx.unit("u")?.hp ?? Number.NaN)
    },
    3: (ctx) => ctx.removeEffect("u", "case-double"),
  })
  battle.step()
  expect(hpOf()).toBe(500)
  battle.step()
  expect(seen).toEqual([2000, 1000])
  expect(hpOf()).toBe(1000)
  battle.step()
  battle.step()
  expect(hpOf()).toBe(500)
})

test("受伤之后上限再变按当时的比例算：1000/2000 掉到 600 后上限回到 1000，生命是 300", () => {
  const { battle, hpOf } = open({
    0: (ctx) => ctx.applyEffect("u", "case-double"),
    2: (ctx) => ctx.dealDamage({ sourceId: "u", targetId: "u", amount: 400, kind: "true" }),
    3: (ctx) => ctx.removeEffect("u", "case-double"),
  })
  for (let tick = 0; tick < 4; tick += 1) battle.step()
  expect(hpOf()).toBe(300)
})

test("不在场时上限变化只记下来，不缩放生命；再上场之后的变化照常缩放", () => {
  const { battle, hpOf } = open({
    0: (ctx) => ctx.retreatUnit("u"),
    1: (ctx) => ctx.applyEffect("u", "case-double"),
  })
  battle.step()
  battle.step()
  expect(hpOf()).toBe(500)
})

test("快照的 maxHp 是生效的最大生命，attributes.maxHp 仍是基础值；读快照不结算缩放", () => {
  const { battle } = open({ 0: (ctx) => ctx.retreatUnit("u"), 1: (ctx) => ctx.applyEffect("u", "case-double") })
  const unitOf = () => battle.snapshot().units.find((unit) => unit.id === "u")!
  battle.step()
  expect(unitOf().maxHp).toBe(1000)
  battle.step()
  const unit = unitOf()
  expect(unit.maxHp).toBe(2000)
  expect(unit.attributes.maxHp).toBe(1000)
  expect(unit.attributes.hp).toBe(500)
})
