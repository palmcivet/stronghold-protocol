import { expect, test } from "vitest"
import { createBattle, TICK, type MissionModule } from "arknights-mission-core"
import { ally, spec } from "#test/fixture.js"

interface Application {
  readonly tick: number
  readonly value: number
  readonly ticks: number
  readonly stackAs?: number
  /** 这一拍改为取下效果。 */
  readonly remove?: boolean
}

/** 按计划在 schedule 槽施加 fragile，每拍在 finale 槽记下 dmgTaken。 */
function run(plan: readonly Application[], steps: number, effectId = "fragile", attribute = "dmgTaken"): number[] {
  const seen: number[] = []
  const module: MissionModule = {
    id: "case",
    install(ctx) {
      ctx.registerSystem({
        id: "apply",
        slot: "schedule",
        priority: 1,
        run(runCtx) {
          for (const entry of plan) {
            if (entry.tick !== runCtx.tick()) continue
            if (entry.remove === true) runCtx.removeEffect("e", effectId)
            else {
              runCtx.applyEffect("e", effectId, {
                value: entry.value,
                duration: entry.ticks * TICK,
                ...(entry.stackAs !== undefined ? { stackAs: entry.stackAs } : {}),
              })
            }
          }
        },
      })
      ctx.registerSystem({
        id: "read",
        slot: "finale",
        priority: 0,
        run(runCtx) {
          seen.push(runCtx.attribute("e", attribute))
        },
      })
    },
  }
  const battle = createBattle(
    spec({ modules: ["case"], units: [ally("e", { side: "enemy", attributes: { hp: 1e6, atk: 100 } })] }),
    [module],
  )
  for (let step = 0; step < steps; step += 1) battle.step()
  return seen
}

const ORDERS = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
] as const

test.each(ORDERS)("三次 fragile 按任何施加顺序都按强度依次接续（%i %i %i）", (...order) => {
  const effects = [
    { value: 0.8, ticks: 60 },
    { value: 0.6, ticks: 150 },
    { value: 0.3, ticks: 300 },
  ]
  const seen = run(
    order.map((index) => ({ tick: 0, ...(effects[index] ?? { value: 0, ticks: 0 }) })),
    320,
  )
  expect(seen[0]).toBeCloseTo(1.8, 9)
  expect(seen[63]).toBeCloseTo(1.6, 9)
  expect(seen[153]).toBeCloseTo(1.3, 9)
  expect(seen[303]).toBe(1)
})

test("随机施加与参照模型一致：每拍生效的是仍未到期的施加里强度最高的一次", () => {
  let seed = 20261011
  const next = (): number => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0
    return seed / 2 ** 32
  }
  const values = [0.1, 0.2, 0.3, 0.5, 0.8]
  for (let round = 0; round < 40; round += 1) {
    const plan: Application[] = []
    for (let count = 0; count < 6; count += 1) {
      plan.push({
        tick: Math.floor(next() * 120),
        value: values[Math.floor(next() * values.length)] ?? 0.1,
        ticks: 10 + Math.floor(next() * 200),
      })
    }
    const steps = 360
    const seen = run(plan, steps)
    const ends = plan.map((entry) => entry.tick + entry.ticks)
    for (let tick = 0; tick < steps; tick += 1) {
      if (ends.some((end) => Math.abs(end - tick) <= 2)) continue
      const live = plan.filter((entry) => entry.tick <= tick && tick < entry.tick + entry.ticks)
      const strongest = live.reduce((best, entry) => Math.max(best, entry.value), 0)
      expect(seen[tick], `round ${round} tick ${tick}`).toBeCloseTo(live.length === 0 ? 1 : 1 + strongest, 9)
    }
  }
})

test("stackAs 决定接续的先后，生效的仍是各自的 value", () => {
  const seen = run(
    [
      { tick: 0, value: 0.1, stackAs: 0.9, ticks: 60 },
      { tick: 0, value: 0.2, stackAs: 0.8, ticks: 150 },
      { tick: 0, value: 0.3, ticks: 300 },
    ],
    320,
    "weaken",
    "atk",
  )
  expect(seen[0]).toBeCloseTo(90, 9)
  expect(seen[63]).toBeCloseTo(80, 9)
  expect(seen[153]).toBeCloseTo(70, 9)
  expect(seen[303]).toBeCloseTo(100, 9)
})

test("强度相同的等待项保留到期最晚的那次的 value", () => {
  const seen = run(
    [
      { tick: 0, value: 0.9, ticks: 60 },
      { tick: 0, value: 0.1, stackAs: 0.8, ticks: 150 },
      { tick: 0, value: 0.3, ticks: 300 },
      { tick: 0, value: 0.2, stackAs: 0.8, ticks: 210 },
      { tick: 0, value: 0.4, stackAs: 0.8, ticks: 180 },
      { tick: 0, value: 0.5, stackAs: 0.8, ticks: 210 },
    ],
    320,
    "weaken",
    "atk",
  )
  expect(seen[63]).toBeCloseTo(80, 9)
  expect(seen[153]).toBeCloseTo(80, 9)
  expect(seen[213]).toBeCloseTo(70, 9)
  expect(seen[303]).toBeCloseTo(100, 9)
})

test("removeEffect 连等待链一起取下，之后的新施加单独计时", () => {
  const seen = run(
    [
      { tick: 0, value: 0.8, ticks: 60 },
      { tick: 0, value: 0.6, ticks: 150 },
      { tick: 0, value: 0.3, ticks: 300 },
      { tick: 1, value: 0, ticks: 0, remove: true },
      { tick: 1, value: 0.1, ticks: 30 },
    ],
    320,
  )
  expect(seen[0]).toBeCloseTo(1.8, 9)
  expect(seen[1]).toBeCloseTo(1.1, 9)
  expect(seen[63]).toBe(1)
  expect(seen.slice(63).every((value) => value === 1)).toBe(true)
})
