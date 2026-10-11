import { expect, test } from "vitest"
import {
  attractPoints,
  createBattle,
  createGrid,
  createRandom,
  defineTag,
  fearReachableTiles,
  fearSteps,
  planFearMove,
  type MissionModule,
  type TileSpec,
} from "arknights-mission-core"
import { ally, spec } from "#test/fixture.js"

function ground(x: number, y: number, deployable = true): TileSpec {
  return { x, y, height: 0, deployable, walkableBy: ["WALK"] }
}

function area(xs: number[], ys: number[], deployable = true): TileSpec[] {
  const tiles: TileSpec[] = []
  for (const y of ys) for (const x of xs) tiles.push(ground(x, y, deployable))
  return tiles
}

test("硬障碍让地面绕行，撤掉之后回到原路", () => {
  const grid = createGrid([...area([0, 1, 2], [0]), ...area([0, 1, 2], [1])])
  const open = grid.waypoints(0, 0, 2, 0)
  expect(open).toEqual([
    { x: 0, y: 0 },
    { x: 2, y: 0 },
  ])
  grid.setObstacle(1, 0, true, "block")
  const blocked = grid.waypoints(0, 0, 2, 0)
  expect(blocked).toEqual([
    { x: 0, y: 0 },
    { x: 0, y: 1 },
    { x: 2, y: 1 },
    { x: 2, y: 0 },
  ])
  grid.setObstacle(1, 0, false, "block")
  expect(grid.waypoints(0, 0, 2, 0)).toEqual(open)
})

test("箱子代价很高时绕行，只有箱子可走时仍然穿过", () => {
  const around = createGrid([...area([0, 1, 2], [0]), ...area([0, 1, 2], [1])])
  around.setObstacle(1, 0, true, "crate")
  expect(around.findPath(0, 0, 2, 0)?.some((tile) => tile.x === 1 && tile.y === 0)).toBe(false)
  const only = createGrid(area([0, 1, 2], [0]))
  only.setObstacle(1, 0, true, "crate")
  expect(only.findPath(0, 0, 2, 0)).toEqual([
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 2, y: 0 },
  ])
})

test("同样步数时少走不能部署的地面", () => {
  const tiles = [
    ground(0, 1),
    ground(3, 1),
    ground(0, 2),
    ground(1, 2, false),
    ground(2, 2, false),
    ground(3, 2),
    ground(0, 0),
    ground(1, 0),
    ground(2, 0),
    ground(3, 0),
  ]
  const path = createGrid(tiles).findPath(0, 1, 3, 1)
  expect(path?.some((tile) => tile.y === 0)).toBe(true)
  expect(path?.some((tile) => tile.y === 2 && (tile.x === 1 || tile.x === 2))).toBe(false)
})

test("没有连通的地面路线时返回空", () => {
  const grid = createGrid([ground(0, 0), ground(2, 0)])
  expect(grid.waypoints(0, 0, 2, 0)).toBeNull()
  expect(grid.findPath(0, 0, 2, 0)).toBeNull()
})

test("地面绕开障碍走一步，飞行沿检查点直线穿过", () => {
  const tiles = [ground(0, 0), ground(2, 0), ...area([0, 1, 2], [1])]
  const route = { checkpoints: [], end: { x: 2, y: 0 } }
  const walk = createBattle(
    spec({
      tiles,
      units: [ally("walker", { side: "enemy", attributes: { moveSpeed: 60 }, route })],
    }),
    [],
  )
  walk.step()
  expect(walk.snapshot().units.find((unit) => unit.id === "walker")).toMatchObject({ x: 0, y: 1 })
  const fly = createBattle(
    spec({
      tiles,
      units: [ally("flyer", { side: "enemy", attributes: { moveSpeed: 60 }, motion: "FLY", route })],
    }),
    [],
  )
  fly.step()
  expect(fly.snapshot().units.find((unit) => unit.id === "flyer")).toMatchObject({ x: 1, y: 0 })
})

test("消失后再出现会改站位", () => {
  const battle = createBattle(
    spec({
      tiles: [ground(0, 0), ground(3, 0)],
      units: [
        ally("hider", {
          side: "enemy",
          attributes: { moveSpeed: 0 },
          route: {
            checkpoints: [{ type: "disappear" }, { type: "appear", x: 3, y: 0 }],
          },
        }),
      ],
    }),
    [],
  )
  battle.step()
  const unit = battle.snapshot().units.find((item) => item.id === "hider")
  expect(unit).toMatchObject({ x: 3, y: 0 })
  expect(unit?.tags).not.toContain("hidden")
})

test("路线消失在状态刷新之后仍留在快照里", () => {
  const MARKED = defineTag("marked", { meaning: "marked by the test module" })
  const module: MissionModule = {
    id: "mark",
    install(ctx) {
      ctx.registerTag(MARKED)
      ctx.registerStatus({
        id: "marked",
        tags: [MARKED],
        modifiers: [],
        immunity: [],
        stackCap: 1,
        cancels: [],
        duration: 5,
      })
      ctx.registerSystem({
        id: "arm",
        slot: "schedule",
        priority: 1,
        run(runCtx) {
          if (runCtx.tick() !== 1) return
          runCtx.applyStatus("hider", "marked")
        },
      })
    },
  }
  const battle = createBattle(
    spec({
      modules: ["mark"],
      tiles: [ground(0, 0), ground(3, 0)],
      units: [
        ally("hider", {
          side: "enemy",
          attributes: { moveSpeed: 0 },
          route: {
            checkpoints: [{ type: "disappear" }, { type: "wait", time: 0.07 }, { type: "appear", x: 3, y: 0 }],
          },
        }),
      ],
    }),
    [module],
  )
  battle.step()
  expect(battle.snapshot().units.find((item) => item.id === "hider")?.tags).toContain("hidden")
  battle.step()
  const hidden = battle.snapshot().units.find((item) => item.id === "hider")
  expect(hidden?.tags).toContain("hidden")
  expect(hidden?.tags).toContain("marked")
  expect(hidden?.x).toBe(0)
  battle.step()
  const shown = battle.snapshot().units.find((item) => item.id === "hider")
  expect(shown?.tags).not.toContain("hidden")
  expect(shown).toMatchObject({ x: 3, y: 0 })
})

test("恐惧扇形远离来源，飞行诱导不绕路", () => {
  const grid = createGrid(area([0, 1, 2, 3, 4], [0, 1, 2]))
  expect(fearReachableTiles(grid, "WALK", 2, 1, 2, 1, true, null)).toEqual([])
  const ahead = fearReachableTiles(grid, "WALK", 2, 1, 0, 1, false, null)
  expect(ahead).toContain("4,1")
  expect(ahead).not.toContain("0,1")
  const blocked = area([0, 1, 2, 3, 4], [0, 1, 2]).map((tile) => (tile.x === 4 && tile.y === 1 ? { ...tile, objective: true } : tile))
  const skipping = fearReachableTiles(createGrid(blocked), "WALK", 2, 1, 0, 1, false, null)
  expect(skipping).not.toContain("4,1")
  expect(skipping).toContain("3,1")
  grid.setObstacle(1, 0, true, "block")
  expect(fearSteps(grid, "WALK", 0, 0, 2, 0, 5)).toBe(4)
  expect(fearSteps(grid, "WALK", 0, 0, 1, 0, 5)).toBe(Infinity)
  expect(attractPoints(grid, "FLY", 0, 0, 2, 0)).toEqual([{ x: 2, y: 0 }])
  expect(attractPoints(grid, "WALK", 0, 0, 2, 0).some((tile) => tile.y === 1)).toBe(true)
  const random = createRandom(1)
  const move = planFearMove(grid, "FLY", 2, 1, ["4,1"], random)
  expect(move.points).toHaveLength(1)
  expect(Math.abs((move.points[0]?.y ?? 99) - 1)).toBeLessThanOrEqual(0.25)
})

test("敌人行动槽只沿路线走，不调用选择器", () => {
  let calls = 0
  const probe: MissionModule = {
    id: "probe",
    install(ctx) {
      ctx.registerSelector({
        id: "trap",
        filter() {
          calls += 1
          return true
        },
        compare() {
          calls += 1
          return 0
        },
      })
    },
  }
  const battle = createBattle(
    spec({
      modules: ["probe"],
      tiles: area([0, 1, 2], [0]),
      units: [
        ally("enemy", {
          side: "enemy",
          attributes: { moveSpeed: 60 },
          route: { checkpoints: [], end: { x: 2, y: 0 } },
        }),
      ],
    }),
    [probe],
  )
  battle.step()
  expect(calls).toBe(0)
  expect(battle.snapshot().units.find((unit) => unit.id === "enemy")?.x).toBeGreaterThan(0)
  expect(calls).toBe(0)
})
