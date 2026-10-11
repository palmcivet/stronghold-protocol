import { expect, test } from "vitest"
import { createBattle, defineEffect, type ContentContext, type MissionModule } from "arknights-mission-core"
import { ally, spec } from "#test/fixture.js"

const removed: string[] = []

function barrier(id: string, shield: { shield?: number; hits?: number }, shieldType?: readonly string[]) {
  return defineEffect(id, {
    duration: 30,
    ...(shieldType ? { shieldType } : {}),
    modifiers: [
      ...(shield.shield !== undefined ? [{ attribute: "shield", op: "add" as const, value: shield.shield }] : []),
      ...(shield.hits !== undefined ? [{ attribute: "shieldHits", op: "add" as const, value: shield.hits }] : []),
    ],
    onRemove: () => void removed.push(id),
  })
}

const barriers = [
  barrier("arts-barrier", { shield: 100 }, ["arts"]),
  barrier("barrier", { shield: 50 }),
  barrier("phys-block", { hits: 1 }, ["physical"]),
  barrier("pa-barrier", { shield: 100 }, ["phys", "arts"]),
  barrier("arts-small", { shield: 20 }, ["arts"]),
]

/** 一个没有防御与法抗的友方，每拍做一步；返回每步之后的 [生命, 护盾合计, 已取下的效果]。 */
function run(steps: readonly ((ctx: ContentContext) => void)[]) {
  removed.length = 0
  const module: MissionModule = {
    id: "case",
    install(ctx) {
      for (const definition of barriers) ctx.registerEffect(definition)
      ctx.registerSystem({ id: "plan", slot: "schedule", priority: 1, run: (runCtx) => steps[runCtx.tick()]?.(runCtx) })
    },
  }
  const battle = createBattle(
    spec({ modules: ["case"], units: [ally("u", { attackRange: [], attributes: { hp: 1000, maxHp: 1000, atk: 0, def: 0, res: 0 } })] }),
    [module],
  )
  return steps.map(() => {
    battle.step()
    const unit = battle.snapshot().units.find((item) => item.id === "u")
    return [unit?.attributes.hp, unit?.shield, [...removed]]
  })
}

const hit = (amount: number, kind: "physical" | "arts" | "true" | "elemental") => (ctx: ContentContext) =>
  ctx.dealDamage({ sourceId: "u", targetId: "u", amount, kind, canDodge: false })
const add = (id: string) => (ctx: ContentContext) => ctx.applyEffect("u", id)

test("法术屏障只挡法术；后加的不分种类的屏障什么都挡；同种伤害先用较早的；只带护盾的效果用完就取下；分种类的次数护盾", () => {
  const reads = run([
    add("arts-barrier"),
    hit(10, "physical"),
    hit(10, "true"),
    hit(10, "elemental"),
    hit(40, "arts"),
    add("barrier"),
    hit(30, "arts"),
    hit(20, "physical"),
    hit(100, "arts"),
    add("phys-block"),
    hit(25, "arts"),
    hit(25, "physical"),
  ])
  expect(reads[3]).toEqual([970, 100, []])
  expect(reads[4]).toEqual([970, 60, []])
  expect(reads[5]).toEqual([970, 110, []])
  expect(reads[6]).toEqual([970, 80, []])
  expect(reads[7]).toEqual([970, 60, []])
  expect(reads[8]).toEqual([930, 0, ["arts-barrier", "barrier"]])
  expect(reads[10]).toEqual([905, 0, ["arts-barrier", "barrier"]])
  expect(reads[11]).toEqual([905, 0, ["arts-barrier", "barrier", "phys-block"]])
})

test("同时挡物理与法术的屏障不挡真实与元素损伤，种类写 phys 也认；单一种类照旧", () => {
  const reads = run([
    add("pa-barrier"),
    hit(10, "true"),
    hit(10, "elemental"),
    hit(30, "physical"),
    hit(30, "arts"),
    hit(50, "arts"),
    add("arts-small"),
    hit(10, "physical"),
  ])
  expect(reads[2]).toEqual([980, 100, []])
  expect(reads[4]).toEqual([980, 40, []])
  expect(reads[5]).toEqual([970, 0, ["pa-barrier"]])
  expect(reads[7]).toEqual([960, 20, ["pa-barrier"]])
})
