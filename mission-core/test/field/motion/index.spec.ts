import { expect, test } from "vitest"
import {
  DEPLOY_STRATEGY,
  SHIFT_FEAR,
  SHIFT_PULL,
  SHIFT_PUSH,
  createBattle,
  deployModule,
  type MissionModule,
} from "arknights-mission-core"
import { ally, spec } from "#test/fixture.js"

const lane = [0, 1, 2, 3, 4, 5].map((x) => ({
  x,
  y: 0,
  height: 0,
  deployable: true,
  walkableBy: ["ground"],
}))

function hit(run: (ctx: {
  shift(actionId: string, unitId: string, input?: { force?: number; fromX?: number; fromY?: number; toX?: number; toY?: number; sourceX?: number; sourceY?: number }): boolean
  dealDamage(info: { sourceId: string; targetId: string; amount: number; kind: "true" }): void
}) => void): MissionModule {
  return {
    id: "hit",
    install(ctx) {
      ctx.registerSystem({
        id: "hit",
        slot: "schedule",
        priority: 0,
        run(runCtx) {
          if (runCtx.tick() !== 0) return
          run(runCtx)
        },
      })
    },
  }
}

test("推力按受力等级写到落点，倒地读这个坐标", () => {
  const battle = createBattle(
    spec({
      modules: [DEPLOY_STRATEGY, "hit"],
      deployStrategy: DEPLOY_STRATEGY,
      tiles: lane,
      units: [
        ally("a"),
        ally("e", { side: "enemy", attributes: { hp: 10, massLevel: 0, moveSpeed: 0 } }),
      ],
    }),
    [
      deployModule,
      hit((ctx) => {
        expect(ctx.shift(SHIFT_PUSH, "e", { force: 1, fromX: -1, fromY: 0 })).toBe(true)
        ctx.dealDamage({ sourceId: "a", targetId: "e", amount: 50, kind: "true" })
      }),
    ],
  )
  battle.step()
  const events = battle.drainEvents()
  const moved = events.find((event) => event.type === "displace")
  expect(moved?.data.x).toBeCloseTo(2.14, 2)
  const downed = events.find((event) => event.type === "downed")
  expect(downed?.data.x).toBe(2)
  expect(downed?.data.y).toBe(0)
})

test("拉力在受力等级不小于 0 时拉到急停圈", () => {
  const battle = createBattle(
    spec({
      modules: ["hit"],
      tiles: lane,
      units: [ally("e", { side: "enemy", x: 4, attributes: { hp: 10, massLevel: 1, moveSpeed: 0 } })],
    }),
    [
      hit((ctx) => {
        ctx.shift(SHIFT_PULL, "e", { force: 1, toX: 0, toY: 0 })
      }),
    ],
  )
  battle.step()
  const moved = battle.snapshot().units.find((unit) => unit.id === "e")
  expect(moved?.x).toBeGreaterThan(0.5)
  expect(moved?.x).toBeLessThan(1)
})

test("恐惧沿扇形走，倒地时先落到计划终点", () => {
  const battle = createBattle(
    spec({
      seed: 1,
      modules: [DEPLOY_STRATEGY, "hit"],
      deployStrategy: DEPLOY_STRATEGY,
      tiles: [
        ...lane,
        ...[0, 1, 2, 3, 4, 5].map((x) => ({ x, y: 1, height: 0, deployable: true, walkableBy: ["ground"] })),
      ],
      units: [ally("e", { side: "enemy", x: 2, y: 1, attributes: { hp: 10, moveSpeed: 1 } })],
    }),
    [
      deployModule,
      hit((ctx) => {
        expect(ctx.shift(SHIFT_FEAR, "e", { sourceX: 0, sourceY: 1 })).toBe(true)
        ctx.dealDamage({ sourceId: "e", targetId: "e", amount: 50, kind: "true" })
      }),
    ],
  )
  battle.step()
  const downed = battle.drainEvents().find((event) => event.type === "downed")
  expect(downed?.data.x).not.toBe(2)
})

test("displace 带位移时长与是否保持朝向：推拉保持朝向，显式关掉或直接移动不保持", () => {
  const battle = createBattle(
    spec({
      modules: [DEPLOY_STRATEGY, "move"],
      deployStrategy: DEPLOY_STRATEGY,
      tiles: lane,
      units: [
        ally("a"),
        ally("e", { side: "enemy", attributes: { hp: 100, massLevel: 0, moveSpeed: 0 } }),
        ally("f", { side: "enemy", x: 3, attributes: { hp: 100, massLevel: 0, moveSpeed: 0 } }),
      ],
    }),
    [
      deployModule,
      {
        id: "move",
        install(ctx) {
          ctx.registerSystem({
            id: "move",
            slot: "schedule",
            priority: 0,
            run(runCtx) {
              if (runCtx.tick() !== 0) return
              runCtx.shift(SHIFT_PUSH, "e", { force: 1, fromX: -1, fromY: 0 })
              runCtx.shift(SHIFT_PUSH, "f", { force: 1, fromX: 2, fromY: 0, keepFacing: false })
              runCtx.displace("a", 1, 0)
            },
          })
        },
      },
    ],
  )
  battle.step()
  const moves = battle
    .drainEvents()
    .filter((event) => event.type === "displace")
    .map((event) => (event.type === "displace" ? [event.data.unitId, event.data.duration, event.data.keepFacing] : []))
  expect(moves).toEqual([
    ["e", 0, true],
    ["f", 0, false],
    ["a", 0, false],
  ])
})
