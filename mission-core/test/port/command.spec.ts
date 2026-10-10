import { expect, test } from "vitest"
import {
  DEPLOY_STRATEGY,
  TICK,
  createBattle,
  createFrameClock,
  deployModule,
  type MissionModule,
} from "arknights-mission-core"
import { ally, spec } from "#test/fixture.js"

test("停顿按汇总后的移速走，含 sluggish", () => {
  const route = { checkpoints: [], end: { x: 5, y: 0 } }
  const tiles = [0, 1, 2, 3, 4, 5].map((x) => ({ x, y: 0, height: 0, deployable: true, walkableBy: ["ground"] }))
  const slow: MissionModule = {
    id: "slow",
    install(ctx) {
      ctx.registerSystem({
        id: "slow",
        slot: "schedule",
        priority: 0,
        run(runCtx) {
          if (runCtx.tick() === 0) runCtx.applyStatus("e", "sluggish")
        },
      })
    },
  }
  const battle = createBattle(
    spec({
      modules: ["slow"],
      tiles,
      units: [ally("e", { side: "enemy", attributes: { hp: 10, moveSpeed: 60 }, route })],
    }),
    [slow],
  )
  battle.step()
  expect(battle.snapshot().units.find((unit) => unit.id === "e")?.x).toBeCloseTo(0.2, 5)
})

test("攻击距离按 rangeExtend 沿行延伸", () => {
  let found: readonly string[] = []
  const look: MissionModule = {
    id: "look",
    install(ctx) {
      ctx.registerSystem({
        id: "look",
        slot: "schedule",
        priority: 0,
        run(runCtx) {
          if (runCtx.tick() !== 0) return
          found = runCtx.unitsInRange("a", ["enemy", "range"])
        },
      })
    },
  }
  const tiles = [0, 1, 2].map((x) => ({ x, y: 0, height: 0, deployable: true, walkableBy: ["ground"] }))
  const battle = createBattle(
    spec({
      modules: ["look"],
      tiles,
      units: [
        ally("a", { attributes: { hp: 10, atk: 1, rangeExtend: 1 }, attackRange: [{ x: 1, y: 0 }] }),
        ally("e", { side: "enemy", x: 2, y: 0, attributes: { hp: 10 } }),
      ],
    }),
    [look],
  )
  battle.step()
  expect(found).toEqual(["e"])
})

test("溢出治疗的护盾到期后去掉", () => {
  const heal: MissionModule = {
    id: "heal",
    install(ctx) {
      ctx.registerSystem({
        id: "heal",
        slot: "schedule",
        priority: 0,
        run(runCtx) {
          if (runCtx.tick() === 0) runCtx.heal("a", 80, { overheal: true, overhealDuration: 1 })
        },
      })
    },
  }
  const battle = createBattle(
    spec({ modules: ["heal"], units: [ally("a", { attributes: { hp: 40, maxHp: 100 } })] }),
    [heal],
  )
  battle.step()
  expect(battle.snapshot().units.find((unit) => unit.id === "a")?.attributes.shield).toBe(20)
  for (let step = 0; step < 30; step += 1) battle.step()
  expect(battle.snapshot().units.find((unit) => unit.id === "a")?.attributes.shield ?? 0).toBe(0)
})

test("摆上障碍后地面路线绕开或停下", () => {
  const block: MissionModule = {
    id: "block-path",
    install(ctx) {
      ctx.registerSystem({
        id: "block-path",
        slot: "schedule",
        priority: 0,
        run(runCtx) {
          if (runCtx.tick() === 0) runCtx.setObstacle(1, 0, true, "block")
        },
      })
    },
  }
  const tiles = [0, 1, 2].flatMap((x) =>
    [0, 1].map((y) => ({ x, y, height: 0, deployable: true, walkableBy: ["ground"] })),
  )
  const battle = createBattle(
    spec({
      modules: ["block-path"],
      tiles,
      units: [
        ally("e", {
          side: "enemy",
          attributes: { hp: 10, moveSpeed: 60 },
          route: { checkpoints: [], end: { x: 2, y: 0 } },
        }),
      ],
    }),
    [block],
  )
  battle.step()
  const moved = battle.snapshot().units.find((unit) => unit.id === "e")
  expect(moved?.y).toBeCloseTo(1, 5)
  expect(moved?.x).toBeLessThan(1.2)
})

test("部署策略打开时，站不住的格子不生成、不位移", () => {
  let spawned = false
  const place: MissionModule = {
    id: "place",
    install(ctx) {
      ctx.registerSystem({
        id: "place",
        slot: "schedule",
        priority: 0,
        run(runCtx) {
          if (runCtx.tick() !== 0) return
          runCtx.spawnUnit(ally("extra", { x: 0, y: 0 }))
          spawned = runCtx.tile(0, 0) !== null
          runCtx.displace("a", 1, 0)
        },
      })
    },
  }
  const battle = createBattle(
    spec({
      modules: [DEPLOY_STRATEGY, "place"],
      deployStrategy: DEPLOY_STRATEGY,
      tiles: [
        { x: 0, y: 0, height: 0, deployable: true, walkableBy: ["ground"] },
        { x: 1, y: 0, height: 0, deployable: false, walkableBy: ["ground"] },
      ],
      units: [ally("a"), ally("b")],
    }),
    [deployModule, place],
  )
  battle.step()
  expect(spawned).toBe(true)
  expect(battle.snapshot().units.some((unit) => unit.id === "extra")).toBe(false)
  expect(battle.snapshot().units.find((unit) => unit.id === "a")).toMatchObject({ x: 0, y: 0 })
})

test("runSteps 之外，按帧速度把事件按拍切开", () => {
  const clock = createFrameClock()
  const battle = createBattle(spec({ units: [ally("a")] }), [])
  const first = clock.advance(battle, TICK / 2, 1)
  expect(first).toHaveLength(0)
  const second = clock.advance(battle, TICK / 2, 1)
  expect(second).toHaveLength(1)
  const fast = clock.advance(battle, TICK, 2)
  expect(fast).toHaveLength(2)
  expect(battle.snapshot().tick).toBe(3)
})
