import { expect, test } from "vitest"
import { createBattle, type BattleSpec, type MissionModule, type UnitSpec } from "arknights-mission-core"
import { choiceModule } from "#server/content/choice/battle/index.js"

function unit(id: string, side: "ally" | "enemy", attributes: Record<string, number>, script: UnitSpec["script"], y = 0): UnitSpec {
  return {
    id,
    side,
    attributes,
    skills: [],
    attackRange: [{ x: 1, y: 0 }],
    tags: [],
    deployPositions: ["ground"],
    x: 0,
    y,
    ...(script ? { script } : {}),
  }
}

function open(units: readonly UnitSpec[], notes: BattleSpec["notes"], extra: readonly MissionModule[] = []): ReturnType<typeof createBattle> {
  const modules = [choiceModule, ...extra]
  const spec: BattleSpec = {
    seed: 1,
    modules: modules.map((module) => module.id),
    tiles: [{ x: 0, y: 0, height: 0, deployable: true, walkableBy: ["ground"] }],
    units,
    spawns: [],
    deployStrategy: null,
    cost: {
      ally: { initial: 0, regen: 0, cap: 0 },
      enemy: { initial: 0, regen: 0, cap: 0 },
    },
    ...(notes ? { notes } : {}),
  }
  return createBattle(spec, modules)
}

function ref(effectId: string): { owner: string; ref: { id: string; key: string; data: { effectId: string } } } {
  return {
    owner: "p1",
    ref: { id: `choice:${effectId}#1`, key: `choice:${effectId}`, data: { effectId } },
  }
}

test("flawless adds 30% atk and def only while the operator is at full hp", () => {
  const probe: MissionModule = {
    id: "probe",
    install(registration) {
      registration.registerSystem({
        id: "probe",
        slot: "finale",
        priority: 0,
        run(ctx) {
          ctx.emit("probe", { atk: ctx.attribute("a", "atk"), def: ctx.attribute("a", "def") })
        },
      })
      registration.registerSystem({
        id: "probe:hit",
        slot: "ally",
        priority: 0,
        run(ctx) {
          if (ctx.tick() !== 1) return
          ctx.dealDamage({ sourceId: "a", targetId: "a", amount: 10, kind: "true" })
        },
      })
    },
  }
  const battle = open(
    [unit("a", "ally", { hp: 1000, atk: 1000, def: 200 }, { owner: "p1" })],
    { choices: [ref("allybuff_select_18")] },
    [probe],
  )
  battle.step()
  const full = battle.drainEvents().filter((event) => event.type === "probe")
  expect(full[0]?.data.atk).toBe(1300)
  expect(full[0]?.data.def).toBe(260)
  battle.step()
  const hurt = battle.drainEvents().filter((event) => event.type === "probe")
  expect(hurt[0]?.data.atk).toBe(1000)
  expect(hurt[0]?.data.def).toBe(200)
})

test("self-heal restores 50 hp per damage instance and stops at max hp", () => {
  const battle = open(
    [unit("a", "ally", { hp: 40, maxHp: 100, atk: 10 }, { owner: "p1" })],
    { choices: [ref("allybuff_select_11")] },
    [{
      id: "probe",
      install(registration) {
        registration.registerSystem({
          id: "probe",
          slot: "ally",
          priority: 0,
          run(ctx) {
            if (ctx.tick() !== 0) return
            ctx.dealDamage({ sourceId: "a", targetId: "a", amount: 10, kind: "true" })
          },
        })
      },
    }],
  )
  battle.step()
  expect(battle.snapshot().units.find((entry) => entry.id === "a")?.attributes.hp).toBe(80)
})

test("enemy attack multipliers apply by rank", () => {
  const probe: MissionModule = {
    id: "probe",
    install(registration) {
      registration.registerSystem({
        id: "probe",
        slot: "finale",
        priority: 0,
        run(ctx) {
          ctx.emit("probe", { normal: ctx.attribute("n", "atk"), elite: ctx.attribute("e", "atk") })
        },
      })
    },
  }
  const battle = open(
    [
      unit("n", "enemy", { hp: 100, atk: 200 }, { owner: "p1", rank: "NORMAL" }),
      unit("e", "enemy", { hp: 100, atk: 200 }, { owner: "p1", rank: "ELITE" }),
    ],
    { choices: [ref("enemydebuff_select_1"), ref("enemydebuff_select_4")] },
    [probe],
  )
  battle.step()
  const event = battle.drainEvents().find((entry) => entry.type === "probe")
  expect(event?.data.normal).toBeCloseTo(190)
  expect(event?.data.elite).toBeCloseTo(178.6)
})

test("same-row redeploy scale applies once three operators share a row", () => {
  const probe: MissionModule = {
    id: "probe",
    install(registration) {
      registration.registerSystem({
        id: "probe",
        slot: "finale",
        priority: 0,
        run(ctx) {
          ctx.emit("probe", { row: ctx.attribute("a", "redeployMul"), other: ctx.attribute("d", "redeployMul") })
        },
      })
    },
  }
  const owner = { owner: "p1" } as const
  const battle = open(
    [
      unit("a", "ally", { hp: 100, atk: 10, redeployMul: 1 }, owner, 3),
      unit("b", "ally", { hp: 100, atk: 10, redeployMul: 1 }, owner, 3),
      unit("c", "ally", { hp: 100, atk: 10, redeployMul: 1 }, owner, 3),
      unit("d", "ally", { hp: 100, atk: 10, redeployMul: 1 }, owner, 1),
    ],
    { choices: [ref("allybuff_select_14")] },
    [probe],
  )
  battle.step()
  const event = battle.drainEvents().find((entry) => entry.type === "probe")
  expect(event?.data.row).toBeCloseTo(0.5)
  expect(event?.data.other).toBeCloseTo(0.5)
})
