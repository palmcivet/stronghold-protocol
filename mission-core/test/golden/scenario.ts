import {
  blockModule,
  costModule,
  leakModule,
  redeployModule,
  SHIFT_ATTRACT,
  SHIFT_FEAR,
  SHIFT_PULL,
  SHIFT_PUSH,
  type ContentContext,
  type MissionModule,
  type TileSpec,
  type UnitSpec,
} from "arknights-mission-core"
import { ally, spec } from "#test/fixture.js"
import type { Scenario } from "#test/replay.js"

function strip(length: number, objectiveAt: number | null = null): TileSpec[] {
  const tiles: TileSpec[] = []
  for (let y = 0; y < 3; y += 1) {
    for (let x = 0; x < length; x += 1) {
      tiles.push({
        x,
        y,
        height: 0,
        deployable: true,
        walkableBy: ["ground"],
        ...(objectiveAt === x && y === 1 ? { objective: true } : {}),
      })
    }
  }
  return tiles
}

function walker(id: string, x: number, y: number, patch: Partial<UnitSpec> = {}): UnitSpec {
  return ally(id, {
    side: "enemy",
    x,
    y,
    facing: "LEFT",
    attributes: { hp: 900, maxHp: 900, atk: 40, def: 20, res: 10, moveSpeed: 1, aspd: 100, bat: 1.5, weight: 2 },
    route: { checkpoints: [], end: { x: 0, y } },
    timers: ["attack"],
    ...patch,
  })
}

function guard(id: string, x: number, y: number, patch: Partial<UnitSpec> = {}): UnitSpec {
  return ally(id, {
    x,
    y,
    attributes: { hp: 1200, maxHp: 1200, atk: 120, def: 60, res: 0, aspd: 100, bat: 1.2, block: 2 },
    attackRange: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 1, y: 1 },
      { x: 1, y: -1 },
    ],
    timers: ["attack"],
    ...patch,
  })
}

/** 在给定拍上执行一段内容操作。 */
function script(id: string, plan: Readonly<Record<number, (ctx: ContentContext) => void>>): MissionModule {
  return {
    id,
    install(ctx) {
      ctx.registerSystem({
        id,
        slot: "schedule",
        priority: 0,
        run(runCtx) {
          plan[runCtx.tick()]?.(runCtx)
        },
      })
    },
  }
}

export const SCENARIOS: readonly Scenario[] = [
  {
    name: "attack-shape",
    ticks: 240,
    spec: () =>
      spec({
        seed: 11,
        modules: ["wound"],
        tiles: strip(6),
        units: [
          guard("splash", 0, 1, { attackShape: { damage: "arts", splash: { radius: 1.2, scale: 0.5, othersOnly: true } } }),
          guard("bounce", 0, 0, { attackShape: { bounce: { count: 3, falloff: 0.25, radius: 1.6, pause: 0.1 } } }),
          guard("medic", 0, 2, {
            attributes: { hp: 1000, maxHp: 1000, atk: 90, def: 0, aspd: 100, bat: 2 },
            attackRange: [
              { x: 0, y: 0 },
              { x: 0, y: -1 },
              { x: 0, y: -2 },
              { x: 1, y: -1 },
            ],
            attackShape: { damage: "heal", chain: { count: 3, falloff: 0.2 } },
          }),
          walker("e1", 3, 1, { route: null }),
          walker("e2", 4, 1, { route: null }),
          walker("e3", 3, 0, { route: null }),
        ],
      }),
    modules: () => [
      script("wound", {
        1: (ctx) => {
          ctx.dealDamage({ sourceId: "e1", targetId: "splash", amount: 700, kind: "true" })
          ctx.dealDamage({ sourceId: "e1", targetId: "bounce", amount: 500, kind: "true" })
        },
      }),
    ],
  },
  {
    name: "projectile",
    ticks: 300,
    spec: () =>
      spec({
        seed: 12,
        tiles: strip(7),
        units: [
          guard("archer", 0, 1, { attackShape: { projectile: "arrow" } }),
          guard("thrower", 0, 0, { attackShape: { projectile: "boomerang" } }),
          guard("bomber", 0, 2, { attackShape: { projectile: "bomb", splash: { radius: 1, groundOnly: true } } }),
          walker("e1", 6, 1),
          walker("e2", 6, 0),
          walker("e3", 6, 2),
        ],
      }),
    modules: () => [],
  },
  {
    name: "status",
    ticks: 300,
    spec: () =>
      spec({
        seed: 13,
        modules: ["status"],
        tiles: strip(7),
        units: [guard("g", 0, 1), walker("e1", 6, 1), walker("e2", 6, 0), walker("e3", 6, 2, { immunity: ["stun"] })],
      }),
    modules: () => [
      script("status", {
        5: (ctx) => ctx.applyStatus("e1", "slow", { duration: 3, value: 0.6 }),
        10: (ctx) => ctx.applyStatus("e2", "cold", { duration: 2 }),
        20: (ctx) => ctx.applyStatus("e2", "cold", { duration: 2 }),
        30: (ctx) => ctx.applyStatus("e3", "stun", { duration: 2 }),
        40: (ctx) => ctx.applyStatus("e1", "palsy", { value: 2 }),
        60: (ctx) => ctx.applyStatus("g", "fragile", { duration: 4, value: 0.3 }),
        90: (ctx) => ctx.applyStatus("e1", "slow", { duration: 2, value: 0.3 }),
      }),
    ],
  },
  {
    name: "element",
    ticks: 300,
    spec: () =>
      spec({
        seed: 14,
        modules: ["element"],
        tiles: strip(6),
        units: [guard("g", 0, 1), walker("e1", 2, 1, { route: null }), walker("e2", 3, 0, { route: null })],
      }),
    modules: () => [
      script("element", {
        3: (ctx) => ctx.addElement("e1", "burn", 600),
        8: (ctx) => ctx.addElement("e1", "burn", 600),
        12: (ctx) => ctx.addElement("e2", "neural", 1200),
        20: (ctx) => ctx.addElement("g", "neural", 1200),
        2: (ctx) => ctx.dealDamage({ sourceId: "e1", targetId: "g", amount: 300, kind: "element", element: "burn" }),
      }),
    ],
  },
  {
    name: "motion",
    ticks: 240,
    spec: () =>
      spec({
        seed: 15,
        modules: ["motion"],
        tiles: strip(8),
        units: [guard("g", 0, 1), walker("e1", 4, 1), walker("e2", 5, 0), walker("e3", 6, 2), walker("e4", 7, 1)],
      }),
    modules: () => [
      script("motion", {
        10: (ctx) => {
          ctx.shift(SHIFT_PUSH, "e1", { force: 2, fromX: 0, fromY: 1 })
        },
        30: (ctx) => {
          ctx.shift(SHIFT_PULL, "e2", { force: 2, toX: 1, toY: 0, fromX: 1, fromY: 0 })
        },
        50: (ctx) => {
          ctx.applyStatus("e3", "fear", { duration: 2 })
          ctx.shift(SHIFT_FEAR, "e3", { sourceX: 0, sourceY: 2 })
        },
        70: (ctx) => {
          ctx.applyStatus("e4", "attract", { duration: 2 })
          ctx.shift(SHIFT_ATTRACT, "e4", { toX: 3, toY: 1 })
        },
        90: (ctx) => ctx.displace("e1", 2.5, 1.25),
      }),
    ],
  },
  {
    name: "block",
    ticks: 300,
    spec: () =>
      spec({
        seed: 16,
        modules: ["block"],
        tiles: strip(7),
        units: [
          guard("g", 1, 1, { attributes: { hp: 3000, maxHp: 3000, atk: 60, def: 100, aspd: 100, bat: 1.2, block: 1 } }),
          walker("e1", 5, 1),
          walker("e2", 6, 1),
          walker("flyer", 6, 0, { motion: "FLY", route: { checkpoints: [], end: { x: 0, y: 1 } } }),
        ],
      }),
    modules: () => [blockModule],
  },
  {
    name: "skill",
    ticks: 300,
    spec: () =>
      spec({
        seed: 17,
        tiles: strip(6),
        units: [
          guard("duration", 0, 1, {
            attributes: { hp: 1200, maxHp: 1200, atk: 120, def: 60, aspd: 100, bat: 1.2, spRecovery: 1 },
            skills: [
              { id: "s1", body: "duration", trigger: "DEFAULT", spCost: 3, initSp: 2, duration: 2, ammo: 0, operation: "AUTO", mods: [{ attribute: "atk", op: "percent", value: 0.8 }] },
            ],
          }),
          guard("ammo", 0, 0, {
            skills: [{ id: "s2", body: "ammo", trigger: "DEFAULT", spCost: 2, initSp: 0, duration: 0, ammo: 3, spType: "attack", operation: "AUTO" }],
          }),
          guard("hurt", 1, 2, {
            skills: [{ id: "s3", body: "instant", trigger: "TAKE_DAMAGE", spCost: 1, duration: 0, ammo: 0, spType: "hurt", operation: "AUTO" }],
          }),
          walker("e1", 3, 1, { route: null }),
          walker("e2", 3, 0, { route: null }),
          walker("e3", 2, 2, { route: null, attackRange: [{ x: 1, y: 0 }] }),
        ],
      }),
    modules: () => [],
  },
  {
    name: "redeploy",
    ticks: 240,
    spec: () =>
      spec({
        seed: 18,
        modules: ["manual", "hit", "redeploy", "cost"],
        deployStrategy: "manual",
        tiles: strip(4),
        cost: { ally: { initial: 2, regen: 1, cap: 99 }, enemy: { initial: 0, regen: 0, cap: 0 } },
        units: [
          guard("a", 0, 1, { attributes: { hp: 400, maxHp: 800, atk: 50, def: 0, aspd: 100, bat: 1, cost: 4, respawnTime: 1 } }),
          walker("e", 2, 1, { route: null, attributes: { hp: 5000, maxHp: 5000, atk: 0, def: 0, aspd: 100, bat: 1 } }),
        ],
      }),
    modules: () => [
      {
        id: "manual",
        install(ctx) {
          ctx.registerDeployStrategy({
            id: "manual",
            opening: () => ["a", "e"],
            downedTile: () => ({ x: 1, y: 1 }),
            canStand: () => true,
          })
        },
      },
      script("hit", {
        5: (ctx) => ctx.dealDamage({ sourceId: "e", targetId: "a", amount: 2000, kind: "true" }),
        150: (ctx) => ctx.dealDamage({ sourceId: "e", targetId: "a", amount: 2000, kind: "true" }),
      }),
      redeployModule,
      costModule,
    ],
  },
  {
    name: "cost",
    ticks: 200,
    spec: () =>
      spec({
        seed: 19,
        modules: ["cost", "spend"],
        tiles: strip(2),
        cost: { ally: { initial: 3, regen: 1.5, cap: 10 }, enemy: { initial: 1, regen: 0.7, cap: 6 } },
        units: [guard("g", 0, 1)],
      }),
    modules: () => [
      costModule,
      script("spend", {
        45: (ctx) => {
          ctx.spendCost("ally", 4)
        },
        90: (ctx) => ctx.addCost("enemy", 2.5),
        120: (ctx) => {
          ctx.spendCost("enemy", 9)
        },
      }),
    ],
  },
  {
    name: "leak",
    ticks: 360,
    spec: () =>
      spec({
        seed: 20,
        modules: ["leak"],
        tiles: strip(6, 0),
        units: [guard("g", 2, 2, { attributes: { hp: 1200, maxHp: 1200, atk: 30, def: 0, aspd: 100, bat: 1.2 } })],
        spawns: [
          { atTick: 0, unit: walker("e1", 5, 1, { route: { checkpoints: [{ type: "move", x: 3, y: 1 }, { type: "wait", time: 0.5 }], end: { x: 0, y: 1 } } }) },
          { atTick: 45, unit: walker("e2", 5, 1, { route: { checkpoints: [], end: { x: 0, y: 1 } } }) },
          { atTick: 90, unit: walker("e3", 5, 1, { motion: "FLY", route: { checkpoints: [{ type: "move", x: 3, y: 2 }], end: { x: 0, y: 1 } } }) },
        ],
      }),
    modules: () => [leakModule],
  },
]
