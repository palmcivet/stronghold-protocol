import { expect, test } from "vitest"
import {
  blockModule,
  createBattle,
  DEPLOY_STRATEGY,
  deployModule,
  SHIFT_PUSH,
  TOKEN,
  type BattleEvent,
  type BattleSpec,
  type ContentContext,
  type MissionModule,
  type UnitSpec,
} from "arknights-mission-core"
import { ally, spec } from "#test/fixture.js"

type Plan = Readonly<Record<number, (ctx: ContentContext) => void>>

const tiles = [0, 1, 2, 3].flatMap((y) => Array.from({ length: 10 }, (_, x) => ({ x, y, height: 0, deployable: true, walkableBy: ["ground"] })))

function open(units: UnitSpec[], plan: Plan = {}, patch: Partial<BattleSpec> = {}, extra: MissionModule[] = []) {
  const seen: { tick: number; event: BattleEvent }[] = []
  let tick = 0
  const module: MissionModule = {
    id: "case",
    install(ctx) {
      ctx.registerSystem({ id: "plan", slot: "schedule", priority: 1, run: (runCtx) => plan[runCtx.tick()]?.(runCtx) })
    },
  }
  const battle = createBattle(spec({ modules: ["case", ...extra.map((item) => item.id)], tiles, units, ...patch }), [module, ...extra])
  for (const event of battle.drainEvents()) seen.push({ tick: -1, event })
  return {
    battle,
    events: seen,
    run(count: number) {
      for (let index = 0; index < count; index += 1) {
        battle.step()
        for (const event of battle.drainEvents()) seen.push({ tick, event })
        tick += 1
      }
    },
    hit(source: string, from = -1): string[] {
      return seen.flatMap(({ tick: at, event }) =>
        at >= from && event.type === "damaged" && event.data.sourceId === source ? [event.data.targetId] : [],
      )
    },
    unit(id: string) {
      const found = battle.snapshot().units.find((item) => item.id === id)
      if (!found) throw new Error(`no ${id}`)
      return found
    },
  }
}

const wall = (id: string, x: number, y: number, patch: Partial<UnitSpec> = {}) =>
  ally(id, { x, y, attackRange: [], attributes: { hp: 1e9, maxHp: 1e9, atk: 0, def: 0, blockCnt: 3 }, ...patch })
/** 范围覆盖整张图的远程敌人。 */
const WHOLE = Array.from({ length: 19 }, (_, x) => x - 9).flatMap((x) => Array.from({ length: 9 }, (_, y) => ({ x, y: y - 4 })))
const shooter = (x: number, y: number, patch: Partial<UnitSpec> = {}, id = "e") =>
  ally(id, { side: "enemy", x, y, timers: ["attack"], attackRange: WHOLE, attributes: { hp: 1e9, atk: 1, def: 0, bat: 1 }, ...patch })

test("#220 优先攻击空中单位的干员挡着地面敌人时先打范围里的飞行敌人；别的特殊优先级仍先打挡着的", () => {
  const shots = (targetPriority: string, other: "soft" | "bat") => {
    const h = open([
      ally("u", {
        x: 4,
        tags: ["can-hit-fly"],
        timers: ["attack"],
        targetPriority,
        blocking: ["walker"],
        attackRange: [0, 1, 2].map((x) => ({ x, y: 0 })),
        attributes: { hp: 1e6, atk: 100, def: 0, bat: 1, blockCnt: 1 },
      }),
      ally("walker", { side: "enemy", x: 4, facing: "LEFT", blockedBy: "u", attackRange: [], attributes: { hp: 1e9, def: 800 } }),
      ally(other, { side: "enemy", x: 6, attackRange: [], ...(other === "bat" ? { motion: "FLY" as const } : {}), attributes: { hp: 1e9, def: 0 } }),
    ])
    h.run(120)
    return new Set(h.hit("u"))
  }
  expect(shots("fly", "bat")).toEqual(new Set(["bat"]))
  expect(shots("defense", "soft")).toEqual(new Set(["walker"]))
  expect(shots("defense", "bat")).toEqual(new Set(["walker"]))
})

test("#1 近地悬浮：算空中单位，地面阻挡者挡不住、近战打不到、对地溅射不波及；仍走地面路线；推不动", () => {
  let pushed = true
  const h = open(
    [
      wall("w", 3, 0),
      ally("blade", { x: 6, y: 1, timers: ["attack"], attackRange: [{ x: 0, y: -1 }], attributes: { hp: 1e9, atk: 100, def: 0, bat: 1 } }),
      ally("f", {
        side: "enemy",
        x: 8,
        y: 0,
        tags: ["float"],
        attackRange: [],
        attributes: { hp: 1e9, atk: 0, def: 0, moveSpeed: 1 },
        route: { checkpoints: [], end: { x: 0, y: 0 } },
      }),
    ],
    { 1: (ctx) => void (pushed = ctx.shift(SHIFT_PUSH, "f", { force: 3, fromX: 9, fromY: 0 })) },
    {},
    [blockModule],
  )
  const rows = new Set<number>()
  for (let tick = 0; tick < 600 && h.unit("f").x > 1.5; tick += 1) {
    h.run(1)
    rows.add(Math.round(h.unit("f").y))
    expect(h.unit("f").blockedBy).toBeNull()
  }
  expect(h.unit("f").x).toBeLessThan(1.5)
  expect([...rows]).toEqual([0])
  expect(pushed).toBe(false)
  expect(h.hit("blade")).toEqual([])
})

test("#1 对地的溅射不波及主目标旁边的近地悬浮敌人", () => {
  const h = open([
    ally("r", {
      tags: ["can-hit-fly"],
      timers: ["attack"],
      attackRange: [1, 2, 3].map((x) => ({ x, y: 0 })),
      attackShape: { splash: { radius: 1.1, groundOnly: true } },
      attributes: { hp: 1e6, atk: 100, def: 0, bat: 1 },
    }),
    ally("g", { side: "enemy", x: 3, y: 0, attackRange: [], attributes: { hp: 1e9, def: 0 } }),
    ally("f", { side: "enemy", x: 3, y: 1, tags: ["float"], attackRange: [], attributes: { hp: 1e9, def: 0 } }),
  ])
  h.run(60)
  expect(h.hit("r")).toContain("g")
  expect(h.hit("r")).not.toContain("f")
})

test("#1 浮空让地面敌人变成空中单位，近战打不到；近地悬浮的敌人能被浮空，浮空结束后仍悬浮", () => {
  const h = open(
    [
      ally("blade", { x: 5, timers: ["attack"], attackRange: [{ x: 1, y: 0 }], attributes: { hp: 1e9, atk: 100, def: 0, bat: 1 } }),
      ally("g", { side: "enemy", x: 6, attackRange: [], attributes: { hp: 1e9, def: 0 } }),
      ally("f", { side: "enemy", x: 6, y: 2, tags: ["float"], attackRange: [], attributes: { hp: 1e9, def: 0 } }),
    ],
    {
      30: (ctx) => {
        ctx.applyEffect("g", "levitate", { duration: 3 })
        ctx.applyEffect("f", "levitate", { duration: 3 })
      },
    },
  )
  h.run(30)
  expect(h.hit("blade").length).toBeGreaterThan(0)
  h.run(60)
  expect(h.hit("blade", 32)).toEqual([])
  expect(h.unit("f").tags).toEqual(expect.arrayContaining(["levitate", "float"]))
  h.run(60)
  expect(h.hit("blade", 125).length).toBeGreaterThan(0)
  expect(h.unit("f").tags).toContain("float")
  expect(h.unit("f").tags).not.toContain("levitate")
})

const deploy = { modules: ["case", DEPLOY_STRATEGY], deployStrategy: DEPLOY_STRATEGY }

test("#5 没被挡的远程敌人：嘲讽高的在前，其次最晚部署的——开场按列从左到右、同列从上到下部署，最右一列的最下面最晚", () => {
  const units = [[5, 1], [3, 2], [4, 3], [7, 3], [8, 2], [8, 1]].map(([x, y], index) => wall(`w${index}`, x ?? 0, y ?? 0))
  const plain = open([...units, shooter(6, 0)], {}, deploy, [deployModule])
  expect(plain.events.flatMap(({ event }) => (event.type === "deploy" ? [event.data.unitId] : []))).toEqual([
    "e",
    "w1",
    "w2",
    "w0",
    "w3",
    "w4",
    "w5",
  ])
  plain.run(60)
  expect(new Set(plain.hit("e"))).toEqual(new Set(["w5"]))
  const taunted = open([wall("w0", 5, 1, { attributes: { hp: 1e9, maxHp: 1e9, taunt: 1 } }), ...units.slice(1), shooter(6, 0)], {}, deploy, [deployModule])
  taunted.run(60)
  expect(new Set(taunted.hit("e"))).toEqual(new Set(["w0"]))
})

test("#5 开场先部署干员再部署召唤物，召唤物最吸引火力；开场时随干员放进来的召唤物也排在所有干员之后；再部署的又是最晚的", () => {
  const tokenFirst = open([wall("a", 3, 0), wall("b", 8, 3), wall("t", 4, 0, { tags: [TOKEN.id] }), shooter(6, 1)], {}, deploy, [deployModule])
  tokenFirst.run(60)
  expect(new Set(tokenFirst.hit("e"))).toEqual(new Set(["t"]))

  const summon: MissionModule = {
    id: "summon",
    install(ctx) {
      ctx.subscribe("deploy", (event, runCtx) => {
        if (event.data.unitId === "a" && !runCtx.unit("s")) runCtx.spawnUnit(wall("s", 4, 0, { tags: [TOKEN.id] }))
      })
    },
  }
  const brought = open(
    [wall("a", 3, 0), wall("b", 8, 3), shooter(6, 1)],
    { 70: (ctx) => void ctx.retreatUnit("a"), 71: (ctx) => void ctx.redeployUnit("a", { delay: 0, cost: 0, tile: { x: 3, y: 0 } }) },
    { ...deploy, modules: [...deploy.modules, "summon"] },
    [deployModule, summon],
  )
  brought.run(60)
  expect(new Set(brought.hit("e"))).toEqual(new Set(["s"]))
  brought.run(60)
  expect(new Set(brought.hit("e", 80))).toEqual(new Set(["a"]))
})

test("#5 隐匿或迷彩的友方只被它挡着的敌人打；挡着别人不让其他远程敌人看见它", () => {
  for (const effect of ["stealth", "camou"]) {
    const h = open(
      [
        wall("s", 3, 0, { blocking: ["near"] }),
        shooter(3, 0, { blockedBy: "s" }, "near"),
        shooter(5, 1, {}, "far"),
      ],
      { 0: (ctx) => ctx.applyEffect("s", effect, { duration: Infinity }) },
    )
    h.run(90)
    expect(h.hit("near")).toContain("s")
    expect(h.hit("far")).toEqual([])
  }
})
