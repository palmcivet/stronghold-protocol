import { expect, test } from "vitest"
import {
  DEFER_DEPLOY,
  DEPLOY_STRATEGY,
  TOKEN,
  createBattle,
  deployModule,
  redeployModule,
  type MissionModule,
  type TileSpec,
  type UnitSpec,
} from "arknights-mission-core"
import { ally, spec } from "#test/fixture.js"

function ground(x: number, y: number, deployable = true): TileSpec {
  return { x, y, height: 0, deployable, walkableBy: ["ground"] }
}

function strike(run: (ctx: {
  displace(id: string, x: number, y: number): void
  dealDamage(info: { sourceId: string; targetId: string; amount: number; kind: "true" }): void
}) => void): MissionModule {
  return {
    id: "strike",
    install(ctx) {
      ctx.registerSystem({
        id: "strike",
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

function battleOf(units: UnitSpec[], run: Parameters<typeof strike>[0], extra: { tiles?: TileSpec[]; redeploy?: boolean } = {}) {
  const modules = [DEPLOY_STRATEGY, "strike", ...(extra.redeploy ? ["redeploy"] : [])]
  return createBattle(
    spec({
      modules,
      deployStrategy: DEPLOY_STRATEGY,
      tiles: extra.tiles ?? [ground(0, 0), ground(1, 0), ground(2, 0), ground(3, 0)],
      units,
      ...(extra.redeploy
        ? {
            cost: {
              ally: { initial: 10, regen: 0, cap: 10 },
              enemy: { initial: 0, regen: 0, cap: 0 },
            },
          }
        : {}),
    }),
    extra.redeploy ? [deployModule, strike(run), redeployModule] : [deployModule, strike(run)],
  )
}

test("开战按列从上到下，干员先于召唤物，推迟的不上场", () => {
  const battle = createBattle(
    spec({
      modules: [DEPLOY_STRATEGY],
      deployStrategy: DEPLOY_STRATEGY,
      tiles: [ground(0, 0), ground(0, 2), ground(1, 0), ground(1, 1), ground(2, 2), ground(3, 1)],
      units: [
        ally("late", { x: 0, y: 0 }),
        ally("top", { x: 0, y: 2 }),
        ally("right", { x: 2, y: 2 }),
        ally("m", { x: 3, y: 1 }),
        ally("k", { x: 3, y: 1 }),
        ally("wolf", { x: 0, y: 2, tags: [TOKEN.id] }),
        ally("drone", { x: 1, y: 1, tags: [TOKEN.id, DEFER_DEPLOY.id] }),
        ally("foe", { side: "enemy", x: 1, y: 0 }),
      ],
    }),
    [deployModule],
  )
  expect(battle.drainEvents().filter((event) => event.type === "deploy").map((event) => event.data.unitId)).toEqual([
    "foe",
    "top",
    "late",
    "right",
    "k",
    "m",
    "wolf",
  ])
})

test("倒在别人的初始格子上，自己的格子空着就回到初始格子", () => {
  const battle = battleOf([ally("a"), ally("b", { x: 2 })], (ctx) => {
    ctx.displace("b", 3, 0)
    ctx.displace("a", 2, 0)
    ctx.dealDamage({ sourceId: "a", targetId: "a", amount: 500, kind: "true" })
  })
  battle.step()
  const downed = battle.drainEvents().find((event) => event.type === "downed")
  expect(downed?.data).toEqual({ unitId: "a", x: 0, y: 0, canStand: true })
  expect(battle.snapshot().units.find((unit) => unit.id === "a")).toMatchObject({ x: 0, y: 0 })
})

test("自己的初始格子被占着就留在倒下的格子，倒地干员占着的格子不能站", () => {
  const battle = battleOf([ally("a"), ally("b", { x: 2 }), ally("c", { x: 3 })], (ctx) => {
    ctx.displace("c", 1, 0)
    ctx.displace("b", 3, 0)
    ctx.displace("a", 2, 0)
    ctx.dealDamage({ sourceId: "b", targetId: "b", amount: 500, kind: "true" })
  })
  battle.step()
  expect(battle.drainEvents().find((event) => event.type === "downed")?.data).toEqual({
    unitId: "b",
    x: 3,
    y: 0,
    canStand: true,
  })
  expect(battle.snapshot().units.find((unit) => unit.id === "a")).toMatchObject({ x: 2, y: 0 })
})

test("召唤物倒在别人的初始格子上，不回到自己的初始格子", () => {
  const battle = battleOf([ally("a"), ally("wolf", { x: 2, tags: [TOKEN.id] })], (ctx) => {
    ctx.displace("a", 3, 0)
    ctx.displace("wolf", 0, 0)
    ctx.dealDamage({ sourceId: "wolf", targetId: "wolf", amount: 500, kind: "true" })
  })
  battle.step()
  expect(battle.drainEvents().find((event) => event.type === "downed")?.data).toMatchObject({
    unitId: "wolf",
    x: 0,
    y: 0,
  })
})

test("还没上场的召唤物占着初始格子，不可部署的格子也不能站", () => {
  const battle = battleOf(
    [
      ally("a"),
      ally("drone", { x: 1, tags: [TOKEN.id, DEFER_DEPLOY.id] }),
      ally("b", { x: 2 }),
    ],
    (ctx) => {
      ctx.displace("a", 1, 0)
      ctx.dealDamage({ sourceId: "a", targetId: "a", amount: 500, kind: "true" })
      ctx.dealDamage({ sourceId: "b", targetId: "b", amount: 500, kind: "true" })
    },
    { tiles: [ground(0, 0), ground(1, 0), ground(2, 0, false)] },
  )
  battle.step()
  expect(battle.drainEvents().filter((event) => event.type === "downed").map((event) => event.data)).toEqual([
    { unitId: "a", x: 0, y: 0, canStand: true },
    { unitId: "b", x: 2, y: 0, canStand: false },
  ])
})

test("再部署停在倒地坐标，这一格有人就继续等", () => {
  const leave: MissionModule = {
    id: "leave",
    install(ctx) {
      ctx.registerSystem({
        id: "leave",
        slot: "schedule",
        priority: 1,
        run(runCtx) {
          if (runCtx.tick() === 1) runCtx.displace("b", 2, 0)
        },
      })
    },
  }
  const battle = createBattle(
    spec({
      modules: [DEPLOY_STRATEGY, "strike", "leave", "redeploy"],
      deployStrategy: DEPLOY_STRATEGY,
      tiles: [ground(0, 0), ground(2, 0)],
      cost: {
        ally: { initial: 10, regen: 0, cap: 10 },
        enemy: { initial: 0, regen: 0, cap: 0 },
      },
      units: [
        ally("a", { attributes: { hp: 40, maxHp: 80, atk: 0, def: 0, cost: 3, respawnTime: 0 } }),
        ally("b", { attributes: { hp: 100, maxHp: 100, atk: 0, def: 0, cost: 0, respawnTime: 0 } }),
      ],
    }),
    [
      deployModule,
      strike((ctx) => {
        ctx.dealDamage({ sourceId: "a", targetId: "a", amount: 500, kind: "true" })
      }),
      leave,
      redeployModule,
    ],
  )
  battle.step()
  expect(battle.snapshot().units.find((unit) => unit.id === "a")?.attributes.hp).toBe(0)
  battle.step()
  expect(battle.snapshot().units.find((unit) => unit.id === "a")).toMatchObject({ x: 0, y: 0 })
  expect(battle.snapshot().units.find((unit) => unit.id === "a")?.attributes.hp).toBe(80)
})
