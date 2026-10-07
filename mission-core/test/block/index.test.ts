import { expect, test } from "vitest"
import { blockModule, createBattle, type MissionModule, type TileSpec } from "arknights-mission-core"
import { ally, spec } from "../fixture.js"

function lane(): TileSpec[] {
  return [0, 1, 2, 3].map((x) => ({ x, y: 0, height: 0, deployable: true, walkableBy: ["ground"] }))
}

const route = { checkpoints: [], end: { x: 3, y: 0 } }

test("接触半径内按阻挡数写回关系，挡住后不再沿路线走", () => {
  const battle = createBattle(
    spec({
      modules: ["block"],
      tiles: lane(),
      units: [
        ally("a", { attributes: { hp: 100, blockCnt: 1 } }),
        ally("near", {
          side: "enemy",
          x: 0.4,
          y: 0,
          attributes: { hp: 50, moveSpeed: 60, blockWeight: 1 },
          route,
        }),
        ally("second", {
          side: "enemy",
          x: 0.4,
          y: 0.1,
          attributes: { hp: 50, moveSpeed: 60, blockWeight: 1 },
          route,
        }),
        ally("far", {
          side: "enemy",
          x: 2,
          y: 0,
          attributes: { hp: 50, moveSpeed: 0 },
        }),
      ],
    }),
    [blockModule],
  )
  battle.step()
  const units = battle.snapshot().units
  expect(units.find((unit) => unit.id === "a")?.blocking).toEqual(["near"])
  expect(units.find((unit) => unit.id === "near")).toMatchObject({ blockedBy: "a", x: 0.4 })
  expect(units.find((unit) => unit.id === "second")?.blockedBy).toBeNull()
  expect(units.find((unit) => unit.id === "far")?.blockedBy).toBeNull()
  expect(battle.drainEvents().filter((event) => event.type === "blocked").map((event) => event.data)).toEqual([
    { blockerId: "a", enemyId: "near" },
  ])
})

test("没写阻挡数时按 1，重量超过阻挡数则不挡", () => {
  const heavy = createBattle(
    spec({
      modules: ["block"],
      units: [
        ally("a"),
        ally("e", { side: "enemy", x: 0.2, y: 0, attributes: { hp: 10, blockWeight: 2 } }),
      ],
    }),
    [blockModule],
  )
  heavy.step()
  expect(heavy.snapshot().units.find((unit) => unit.id === "e")?.blockedBy).toBeNull()

  const plain = createBattle(
    spec({
      modules: ["block"],
      units: [ally("a"), ally("e", { side: "enemy", x: 0.2, y: 0 })],
    }),
    [blockModule],
  )
  plain.step()
  expect(plain.snapshot().units.find((unit) => unit.id === "a")?.blocking).toEqual(["e"])
})

test("更近的阻挡者优先，距离相同取更小的行再取更小的列", () => {
  const battle = createBattle(
    spec({
      modules: ["block"],
      units: [
        ally("east", { x: 0.5, y: 0, attributes: { hp: 10, blockCnt: 1 } }),
        ally("west", { x: -0.5, y: 0, attributes: { hp: 10, blockCnt: 1 } }),
        ally("e", { side: "enemy", x: 0, y: 0 }),
      ],
    }),
    [blockModule],
  )
  battle.step()
  expect(battle.snapshot().units.find((unit) => unit.id === "e")?.blockedBy).toBe("west")
})

test("眩晕会放开已经挡住的敌人", () => {
  const stun: MissionModule = {
    id: "stun",
    install(ctx) {
      ctx.registerSystem({
        id: "stun",
        slot: "ally",
        priority: 0,
        run(runCtx) {
          if (runCtx.tick() === 0) runCtx.applyStatus("a", "stun", { duration: 5 })
        },
      })
    },
  }
  const battle = createBattle(
    spec({
      modules: ["block", "stun"],
      tiles: lane(),
      units: [
        ally("a", { attributes: { hp: 100, blockCnt: 1 } }),
        ally("e", {
          side: "enemy",
          x: 0.3,
          y: 0,
          attributes: { hp: 40, moveSpeed: 60 },
          route,
        }),
      ],
    }),
    [blockModule, stun],
  )
  battle.step()
  expect(battle.snapshot().units.find((unit) => unit.id === "e")).toMatchObject({ blockedBy: "a", x: 0.3 })
  battle.step()
  const enemy = battle.snapshot().units.find((unit) => unit.id === "e")
  expect(enemy?.blockedBy).toBeNull()
  expect(enemy?.x).toBeGreaterThan(0.3)
  expect(battle.drainEvents().some((event) => event.type === "unblocked")).toBe(true)
})

test("没装阻挡模块时，规格里写好的阻挡关系保持不变", () => {
  const battle = createBattle(
    spec({
      tiles: lane(),
      units: [
        ally("a", { blocking: ["e"] }),
        ally("e", {
          side: "enemy",
          x: 0.3,
          y: 0,
          blockedBy: "a",
          attributes: { hp: 40, moveSpeed: 60 },
          route,
        }),
      ],
    }),
    [],
  )
  battle.step()
  battle.step()
  expect(battle.snapshot().units.find((unit) => unit.id === "a")?.blocking).toEqual(["e"])
  expect(battle.snapshot().units.find((unit) => unit.id === "e")).toMatchObject({ blockedBy: "a", x: 0.3 })
  expect(battle.drainEvents().some((event) => event.type === "blocked" || event.type === "unblocked")).toBe(false)
})
