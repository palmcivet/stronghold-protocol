import { expect, test } from "vitest"
import {
  UnknownRegistrationError,
  createBattle,
  type MissionModule,
  type TileSpec,
  type UnitSpec,
} from "arknights-mission-core"
import { ally, spec } from "#test/fixture.js"

const lane: readonly TileSpec[] = [0, 1, 2, 3].map((x) => ({
  x,
  y: 0,
  height: 0,
  deployable: true,
  walkableBy: ["ground"],
}))

function query(units: readonly UnitSpec[], selector: string | readonly string[], origin = "a"): readonly string[] {
  let found: readonly string[] = []
  const module: MissionModule = {
    id: "case",
    install(ctx) {
      ctx.registerSystem({
        id: "case",
        slot: "schedule",
        priority: 1,
        run(runCtx) {
          found = runCtx.unitsInRange(origin, selector)
        },
      })
    },
  }
  const battle = createBattle(
    spec({
      modules: ["case"],
      tiles: lane,
      units,
    }),
    [module],
  )
  battle.step()
  return found
}

test("筛选和排序按名单顺序叠，单个 all 仍然可用", () => {
  const units = [
    ally("a", {
      attackRange: [
        { x: 1, y: 0 },
        { x: 2, y: 0 },
        { x: 3, y: 0 },
      ],
    }),
    ally("near", { side: "enemy", x: 1, y: 0, attributes: { hp: 100, def: 5 } }),
    ally("far", { side: "enemy", x: 2, y: 0, attributes: { hp: 100, def: 5 } }),
    ally("weak", { side: "enemy", x: 3, y: 0, attributes: { hp: 100, def: 1 } }),
    ally("friend", { x: 1, y: 0, attributes: { hp: 100, def: 0 } }),
  ]
  const stacked = query(units, ["enemy", "defense", "distance"])
  expect(stacked).toEqual(["weak", "near", "far"])
  const everyone = query(units, "all")
  const listed = query(units, ["all"])
  expect(everyone).toEqual(listed)
  expect(everyone).toContain("near")
  expect(everyone).toContain("friend")
})

test("未知筛选或排序标识被拒绝", () => {
  const battle = createBattle(spec({ units: [ally("a")] }), [])
  expect(() => {
    const probe: MissionModule = {
      id: "case",
      install(ctx) {
        ctx.registerSystem({
          id: "case",
          slot: "schedule",
          priority: 1,
          run(runCtx) {
            runCtx.select(["enemy", "missing-sort"], ["a"])
          },
        })
      },
    }
    createBattle(spec({ modules: ["case"], units: [ally("a")] }), [probe]).step()
  }).toThrow(UnknownRegistrationError)
  try {
    const probe: MissionModule = {
      id: "case",
      install(ctx) {
        ctx.registerSystem({
          id: "case",
          slot: "schedule",
          priority: 1,
          run(runCtx) {
            runCtx.select("missing-filter", [])
          },
        })
      },
    }
    createBattle(spec({ modules: ["case"], units: [ally("a")] }), [probe]).step()
    expect.unreachable()
  } catch (error) {
    expect(error).toBeInstanceOf(UnknownRegistrationError)
    expect((error as UnknownRegistrationError).registry).toBe("selector")
    expect((error as UnknownRegistrationError).id).toBe("missing-filter")
  }
  expect(battle.snapshot().units.map((unit) => unit.id)).toEqual(["a"])
})

test("飞行、隐匿、迷彩和范围效果按各自的筛选分开", () => {
  const ground = ally("ground", { side: "enemy", x: 1, y: 0 })
  const flyer = ally("flyer", { side: "enemy", x: 2, y: 0, motion: "FLY" })
  const attacker = ally("a", {
    attackRange: [
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ],
  })
  expect(query([attacker, ground, flyer], ["enemy", "fly"])).toEqual(["ground"])
  expect(query([{ ...attacker, tags: ["canHitFly"] }, ground, flyer], ["enemy", "fly"])).toEqual(["ground", "flyer"])

  let hidden: readonly string[] = []
  let revealed: readonly string[] = []
  const stealth: MissionModule = {
    id: "case",
    install(ctx) {
      ctx.registerSystem({
        id: "case",
        slot: "schedule",
        priority: 1,
        run(runCtx) {
          runCtx.applyStatus("e", "stealth")
          hidden = runCtx.unitsInRange("a", ["enemy", "stealth"])
          runCtx.applyStatus("e", "reveal")
          revealed = runCtx.unitsInRange("a", ["enemy", "stealth"])
        },
      })
    },
  }
  createBattle(
    spec({
      modules: ["case"],
      tiles: lane,
      units: [ally("a"), ally("e", { side: "enemy", x: 1, y: 0 })],
    }),
    [stealth],
  ).step()
  expect(hidden).toEqual([])
  expect(revealed).toEqual(["e"])

  const camou = ally("camou", { x: 1, y: 0 })
  const enemy = ally("e", { side: "enemy", attackRange: [{ x: 1, y: 0 }] })
  let plain: readonly string[] = []
  let area: readonly string[] = []
  const paint: MissionModule = {
    id: "case",
    install(ctx) {
      ctx.registerSystem({
        id: "case",
        slot: "schedule",
        priority: 1,
        run(runCtx) {
          runCtx.applyStatus("camou", "camou")
          plain = runCtx.unitsInRange("e", ["ally", "camouflage"])
          area = runCtx.unitsInRange("e", ["ally", "area"])
        },
      })
    },
  }
  createBattle(spec({ modules: ["case"], tiles: lane, units: [enemy, camou] }), [paint]).step()
  expect(plain).toEqual([])
  expect(area).toEqual(["camou"])
})

test("阻挡优先只读已有关系，特殊优先级、仇恨、路程、生命和防御按键排序", () => {
  const blocked = query(
    [
      ally("a", {
        attackRange: [
          { x: 1, y: 0 },
          { x: 3, y: 0 },
        ],
        blocking: ["far"],
      }),
      ally("near", { side: "enemy", x: 1, y: 0 }),
      ally("far", { side: "enemy", x: 3, y: 0, blockedBy: "a" }),
    ],
    ["enemy", "block", "distance"],
  )
  expect(blocked).toEqual(["far", "near"])

  const none = query(
    [
      ally("a", {
        attackRange: [
          { x: 1, y: 0 },
          { x: 3, y: 0 },
        ],
      }),
      ally("near", { side: "enemy", x: 1, y: 0 }),
      ally("far", { side: "enemy", x: 3, y: 0 }),
    ],
    ["enemy", "block", "distance"],
  )
  expect(none).toEqual(["near", "far"])

  const priority = query(
    [
      ally("a", {
        targetPriority: "fly",
        attackRange: [
          { x: 1, y: 0 },
          { x: 2, y: 0 },
        ],
        tags: ["canHitFly"],
      }),
      ally("ground", { side: "enemy", x: 1, y: 0 }),
      ally("flyer", { side: "enemy", x: 2, y: 0, motion: "FLY" }),
    ],
    ["enemy", "fly", "priority"],
  )
  expect(priority).toEqual(["flyer", "ground"])

  const hated = query(
    [
      ally("e", { side: "enemy", attackRange: [{ x: 1, y: 0 }, { x: 2, y: 0 }] }),
      ally("early", { x: 1, y: 0, aggroSeq: 1 }),
      ally("late", { x: 2, y: 0, aggroSeq: 4 }),
    ],
    ["ally", "aggro"],
    "e",
  )
  expect(hated).toEqual(["late", "early"])

  const ratio = query(
    [
      ally("a", { attackRange: [{ x: 1, y: 0 }, { x: 2, y: 0 }] }),
      ally("full", { side: "enemy", x: 1, y: 0, attributes: { hp: 100, def: 0 } }),
      ally("hurt", { side: "enemy", x: 2, y: 0, attributes: { hp: 20, maxHp: 100, def: 9 } }),
    ],
    ["enemy", "hp-ratio"],
  )
  expect(ratio).toEqual(["hurt", "full"])
  expect(
    query(
      [
        ally("a", { attackRange: [{ x: 1, y: 0 }, { x: 2, y: 0 }] }),
        ally("soft", { side: "enemy", x: 2, y: 0, attributes: { hp: 100, def: 1 } }),
        ally("hard", { side: "enemy", x: 1, y: 0, attributes: { hp: 100, def: 30 } }),
      ],
      ["enemy", "defense"],
    ),
  ).toEqual(["soft", "hard"])
})

test("起飞的干员不被地面敌人选中，孤立友方不被友方选中", () => {
  let grounded: readonly string[] = []
  let flying: readonly string[] = []
  const lift: MissionModule = {
    id: "case",
    install(ctx) {
      ctx.registerSystem({
        id: "case",
        slot: "schedule",
        priority: 1,
        run(runCtx) {
          runCtx.applyStatus("a", "liftoff")
          grounded = runCtx.unitsInRange("walker", ["ally", "liftoff"])
          flying = runCtx.unitsInRange("flyer", ["ally", "liftoff"])
        },
      })
    },
  }
  createBattle(
    spec({
      modules: ["case"],
      tiles: lane,
      units: [
        ally("a", { x: 1, y: 0 }),
        ally("walker", { side: "enemy", attackRange: [{ x: 1, y: 0 }] }),
        ally("flyer", { side: "enemy", x: 2, y: 0, motion: "FLY", attackRange: [{ x: -1, y: 0 }] }),
      ],
    }),
    [lift],
  ).step()
  expect(grounded).toEqual([])
  expect(flying).toEqual(["a"])

  let allies: readonly string[] = []
  const alone: MissionModule = {
    id: "case",
    install(ctx) {
      ctx.registerSystem({
        id: "case",
        slot: "schedule",
        priority: 1,
        run(runCtx) {
          runCtx.applyStatus("lone", "isolated")
          allies = runCtx.unitsInRange("a", ["ally", "isolated"])
        },
      })
    },
  }
  createBattle(
    spec({
      modules: ["case"],
      tiles: lane,
      units: [
        ally("a", {
          attackRange: [
            { x: 1, y: 0 },
            { x: 2, y: 0 },
          ],
        }),
        ally("friend", { x: 1, y: 0 }),
        ally("lone", { x: 2, y: 0 }),
      ],
    }),
    [alone],
  ).step()
  expect(allies).toEqual(["friend"])
})
