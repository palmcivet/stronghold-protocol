import { expect, test } from "vitest"
import { ALLY_TARGET, createBattle, type BattleEvent, type ContentContext, type MissionModule, type UnitSpec } from "arknights-mission-core"
import { ally, spec } from "#test/fixture.js"

const tiles = Array.from({ length: 8 }, (_, x) => ({ x, y: 0, height: 0, deployable: true, walkableBy: ["ground"] }))

function open(units: UnitSpec[], plan: Readonly<Record<number, (ctx: ContentContext) => void>> = {}) {
  const module: MissionModule = {
    id: "case",
    install(ctx) {
      ctx.registerSystem({ id: "plan", slot: "schedule", priority: 1, run: (runCtx) => plan[runCtx.tick()]?.(runCtx) })
    },
  }
  const battle = createBattle(spec({ modules: ["case"], tiles, units }), [module])
  battle.drainEvents()
  const events: { tick: number; event: BattleEvent }[] = []
  let tick = 0
  return {
    run(count: number) {
      for (let index = 0; index < count; index += 1) {
        battle.step()
        for (const event of battle.drainEvents()) events.push({ tick, event })
        tick += 1
      }
    },
    targets(unitId: string): readonly (readonly string[])[] {
      return events.flatMap(({ event }) => (event.type === "attack" && event.data.unitId === unitId ? [event.data.targetIds] : []))
    },
    hits(source: string, target: string, from = 0): number {
      return events.filter(
        ({ tick: at, event }) =>
          at >= from && event.type === "damaged" && event.data.sourceId === source && event.data.targetId === target && event.data.attack === true,
      ).length
    },
    flew(source: string, target: string): boolean {
      return events.some(({ event }) => event.type === "projectile" && event.data.sourceId === source && event.data.targetId === target)
    },
  }
}

const guard = (patch: Partial<UnitSpec> = {}) =>
  ally("g", { x: 4, timers: ["attack"], attackRange: [{ x: 0, y: 0 }, { x: 1, y: 0 }], attributes: { hp: 1e6, atk: 100, def: 0, bat: 1 }, ...patch })
const target = (tags: string[] = []) => ally("t", { x: 5, attackRange: [], tags, attributes: { hp: 1e9, maxHp: 1e9, atk: 0, def: 0 } })
const foe = () => ally("e", { side: "enemy", x: 5, facing: "LEFT", attackRange: [], attributes: { hp: 1e9, atk: 0, def: 0 } })

test("没有 ally-target 时谁都不选友方；带上时范围里有它的普攻选它，排在所有敌人之后", () => {
  const plain = open([guard(), target()])
  plain.run(60)
  expect(plain.targets("g")).toEqual([])

  const marked = open([guard(), target([ALLY_TARGET.id])])
  marked.run(60)
  expect(marked.targets("g")[0]).toEqual(["t"])

  const withFoe = open([guard(), target([ALLY_TARGET.id]), foe()])
  withFoe.run(60)
  expect(withFoe.targets("g")[0]).toEqual(["e"])

  const all = open([guard({ attackShape: { lockRange: true } }), target([ALLY_TARGET.id]), foe()])
  all.run(60)
  expect(all.targets("g")[0]).toEqual(["e", "t"])
})

test("打友方目标是真的攻击：近战当场命中，远程飞投射物过去；撤下之后不再选它", () => {
  const sniper = ally("s", {
    x: 2,
    timers: ["attack"],
    attackRange: [0, 1, 2, 3].map((x) => ({ x, y: 0 })),
    attackShape: { projectile: "arrow" },
    attributes: { hp: 1e6, atk: 100, def: 0, bat: 1 },
  })
  const h = open([guard(), sniper, target([ALLY_TARGET.id])], { 120: (ctx) => void ctx.retreatUnit("t") })
  h.run(120)
  expect(h.hits("g", "t")).toBeGreaterThan(0)
  expect(h.hits("s", "t")).toBeGreaterThan(0)
  expect(h.flew("s", "t")).toBe(true)
  h.run(90)
  expect(h.hits("g", "t", 125)).toBe(0)
  expect(h.hits("s", "t", 150)).toBe(0)
})
