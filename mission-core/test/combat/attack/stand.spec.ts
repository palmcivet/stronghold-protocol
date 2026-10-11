import { describe, expect, test } from "vitest"
import { ATTACK_MOVES } from "#port/tag.js"
import {
  TICK,
  createBattle,
  type ContentContext,
  type MissionModule,
  type RouteCheckpoint,
  type TileSpec,
  type UnitSpec,
} from "arknights-mission-core"
import { ally, spec } from "#test/fixture.js"

const lane: readonly TileSpec[] = Array.from({ length: 12 }, (_, x) => ({ x, y: 0, height: 0, deployable: true, walkableBy: ["ground"] }))
const wide = Array.from({ length: 25 }, (_, index) => ({ x: index - 12, y: 0 }))

interface Options {
  readonly bat: number
  readonly clip?: { duration: number; hit: number }
  readonly tags?: readonly string[]
  readonly target?: boolean
  readonly checkpoints?: readonly RouteCheckpoint[]
  readonly start?: number
  readonly plan?: Readonly<Record<number, (ctx: ContentContext) => void>>
}

interface Row {
  readonly tick: number
  readonly x: number
  readonly hidden: boolean
  readonly stand: unknown
}

/** 敌人从右往左走，左端放一个打不死的友方。记每拍的位置、站定视图与命中的拍。 */
function walk(options: Options, ticks: number): { rows: Row[]; hits: number[] } {
  const hits: number[] = []
  const module: MissionModule = {
    id: "case",
    install(ctx) {
      ctx.subscribe("attack-hit", (event) => {
        if (event.data.unitId === "e") hits.push(event.tick)
      })
      ctx.registerSystem({
        id: "plan",
        slot: "schedule",
        priority: 1,
        run(runCtx) {
          options.plan?.[runCtx.tick()]?.(runCtx)
        },
      })
    },
  }
  const start = options.start ?? 9
  const enemy: UnitSpec = ally("e", {
    side: "enemy",
    x: start,
    y: 0,
    facing: "LEFT",
    attributes: { hp: 1e9, atk: 1, def: 0, moveSpeed: 1, bat: options.bat },
    attackRange: wide,
    tags: options.tags ?? [],
    timers: ["attack"],
    route: { checkpoints: options.checkpoints ?? [], end: { x: 0, y: 0 } },
    ...(options.clip ? { attackClip: options.clip } : {}),
  })
  const units = options.target === false ? [enemy] : [ally("a", { x: 0, y: 0, attributes: { hp: 1e9, atk: 0, def: 1e6 }, attackRange: [] }), enemy]
  const battle = createBattle(spec({ modules: ["case"], tiles: lane, units }), [module])
  const rows: Row[] = []
  for (let step = 0; step < ticks; step += 1) {
    battle.step()
    const unit = battle.snapshot().units.find((item) => item.id === "e")
    if (!unit) break
    rows.push({ tick: step, x: unit.x, hidden: unit.tags.includes("hidden"), stand: unit.components["attack:stand"] ?? null })
  }
  return { rows, hits }
}

/** from 之后到 to 为止（都是拍）走过的距离。 */
function walked(rows: readonly Row[], from: number, to: number): number {
  let distance = 0
  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index]
    const prior = rows[index - 1]
    if (!row || !prior || row.tick <= from || row.tick > to) continue
    distance += Math.abs(row.x - prior.x)
  }
  return distance
}

const seconds = (value: number): number => Math.round(value / TICK)

describe("敌人出手站定", () => {
  test("有攻击片段时站过前摇与命中后的余下片段，两次出手之间照走", () => {
    const { rows, hits } = walk({ bat: 2.7, clip: { duration: 1, hit: 0.533 } }, seconds(16))
    expect(hits.length).toBeGreaterThanOrEqual(4)
    for (const hit of hits.slice(1, 3)) {
      expect(walked(rows, hit - seconds(0.533) + 2, hit)).toBe(0)
      expect(walked(rows, hit, hit + seconds(0.467) - 1)).toBe(0)
      const between = walked(rows, hit + seconds(0.467) + 2, hit + seconds(2.7 - 0.533) - 1)
      expect(between).toBeGreaterThan(0.7)
      expect(between).toBeLessThan(0.9)
    }
  })

  test("出手比片段快时片段一起变短，有目标期间一直站着", () => {
    const { rows, hits } = walk({ bat: 1, clip: { duration: 2, hit: 1 } }, seconds(6))
    expect(hits.length).toBeGreaterThanOrEqual(5)
    expect(walked(rows, hits[0] ?? 0, hits.at(-1) ?? 0)).toBe(0)
  })

  test("不停止移动的攻击者边走边打，同一个敌人没有这个标签时站定", () => {
    const moving = walk({ bat: 2, clip: { duration: 1.5, hit: 0.5 }, tags: [ATTACK_MOVES.id] }, seconds(12))
    const standing = walk({ bat: 2, clip: { duration: 1.5, hit: 0.5 } }, seconds(12))
    expect(moving.hits.length).toBeGreaterThanOrEqual(3)
    expect(standing.hits.length).toBeGreaterThanOrEqual(3)
    for (const hit of moving.hits.slice(0, 3)) expect(walked(moving.rows, hit - seconds(0.5), hit + seconds(1))).toBeGreaterThan(0.6 * 0.5 * 1.5)
    for (const hit of standing.hits.slice(0, 3)) expect(walked(standing.rows, hit - seconds(0.5) + 2, hit + seconds(1) - 1)).toBe(0)
  })

  test("没有片段时命中后站 0.35 秒、没有前摇站定；晕眩打断站定，晕眩结束后接着走", () => {
    const { rows, hits } = walk(
      { bat: 5, start: 4, plan: { 20: (ctx) => ctx.applyEffect("e", "stun", { duration: 0.5 }) } },
      seconds(2),
    )
    const first = hits[0] ?? -1
    expect(first).toBe(0)
    const struck = rows[first]
    expect(struck?.stand).toEqual({ until: first + 0.35 / TICK, cutAt: null })
    expect(walked(rows, first, first + seconds(0.35) - 1)).toBe(0)
    expect(walked(rows, first + seconds(0.35) + 1, 19)).toBeGreaterThan(0)
  })

  test("命中后站定期间被晕眩：站定作废并记下打断的拍，晕眩结束后接着走", () => {
    const { rows, hits } = walk(
      { bat: 5, start: 4, clip: { duration: 3, hit: 0.5 }, plan: { 40: (ctx) => ctx.applyEffect("e", "stun", { duration: 0.5 }) } },
      seconds(3),
    )
    const first = hits[0] ?? -1
    expect(first).toBe(seconds(0.5))
    expect(rows[first]?.stand).toEqual({ until: first + 2.5 / TICK, cutAt: null })
    const x = rows[39]?.x ?? Number.NaN
    expect(walked(rows, first, 40)).toBe(0)
    expect(rows[40]?.stand).toEqual({ until: null, cutAt: 40 })
    // 排程槽施加的晕眩当拍就计第一拍，到第 53 拍为止都晕着，不走
    const end = 53
    expect(walked(rows, 40, end)).toBe(0)
    expect(rows[end + 1]?.x).toBeLessThan(x)
  })

  test("站定只停住行走：等待照常走完，出手比片段快的敌人在目标还在时不离开", () => {
    const leaves = (bat: number, duration: number, target: boolean) => {
      const { rows, hits } = walk({ bat, clip: { duration, hit: duration / 2 }, target, start: 3, checkpoints: [{ type: "wait", time: 3 }] }, seconds(8))
      const moved = rows.find((row) => row.x !== rows[0]?.x)?.tick ?? null
      return { moved, hits: hits.length }
    }
    const free = leaves(2.7, 1, false)
    const sniper = leaves(2.7, 1, true)
    const quick = leaves(1, 2, true)
    expect(free.hits).toBe(0)
    expect(sniper.hits).toBeGreaterThanOrEqual(2)
    expect(quick.hits).toBeGreaterThanOrEqual(5)
    expect(free.moved).toBe(seconds(3))
    expect(sniper.moved).toBeGreaterThan(free.moved ?? Infinity)
    expect(sniper.moved).toBeLessThanOrEqual(seconds(3.7) + 2)
    expect(quick.moved).toBeNull()
  })

  test("站定期间路线照常消失与出现，消失时站定作废", () => {
    const { rows, hits } = walk(
      {
        bat: 1,
        clip: { duration: 2, hit: 1 },
        start: 8,
        checkpoints: [{ type: "wait", time: 1.5 }, { type: "disappear" }, { type: "wait", time: 1 }, { type: "appear", x: 4, y: 0 }],
      },
      seconds(4),
    )
    expect(hits.length).toBeGreaterThanOrEqual(1)
    const hidden = rows.find((row) => row.hidden)
    expect(hidden?.tick).toBe(seconds(1.5))
    const after = rows.find((row) => row.tick > (hidden?.tick ?? 0) && !row.hidden)
    expect(after?.tick).toBe(seconds(2.5))
    expect(after?.x).toBe(4)
    const cut = rows.find((row) => row.tick > (hidden?.tick ?? 0))
    expect(cut?.stand).toMatchObject({ until: null })
  })

  test("位移打断站定", () => {
    const { rows, hits } = walk({ bat: 5, start: 4, clip: { duration: 3, hit: 0.5 }, plan: { 30: (ctx) => ctx.displace("e", 5, 0) } }, seconds(1.5))
    expect(hits[0]).toBe(seconds(0.5))
    expect(rows[29]).toMatchObject({ x: 4, stand: { until: seconds(0.5) + 2.5 / TICK, cutAt: null } })
    expect(rows[30]?.stand).toEqual({ until: null, cutAt: 30 })
    expect(rows[30]?.x).toBeCloseTo(5 - 0.5 * TICK, 9)
    expect(walked(rows, 31, rows.length)).toBeGreaterThan(0)
  })
})
