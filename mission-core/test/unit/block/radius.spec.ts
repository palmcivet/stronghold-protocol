import { expect, test } from "vitest"
import {
  BLOCK_FLY,
  DEVICE,
  STEALTH_RESTORE,
  blockModule,
  createBattle,
  type MissionModule,
} from "arknights-mission-core"
import { ally, spec } from "#test/fixture.js"

const lane = [0, 1, 2, 3].map((x) => ({ x, y: 0, height: 0, deployable: true, walkableBy: ["ground"] }))

test("飞行敌人用飞行半径，而且要阻挡者带 blockFly", () => {
  const open = (tags: string[]) =>
    createBattle(
      spec({
        modules: ["block"],
        tiles: lane,
        units: [
          ally("a", { tags }),
          ally("e", { side: "enemy", x: 0.8, y: 0, motion: "FLY", attributes: { hp: 10, moveSpeed: 0 } }),
        ],
      }),
      [blockModule],
    )
  const plain = open([])
  plain.step()
  expect(plain.snapshot().units.find((unit) => unit.id === "e")?.blockedBy).toBeNull()
  const flying = open([BLOCK_FLY.id])
  flying.step()
  expect(flying.snapshot().units.find((unit) => unit.id === "e")?.blockedBy).toBe("a")
})

test("装置用更小的接触半径", () => {
  const battle = createBattle(
    spec({
      modules: ["block"],
      units: [
        ally("a", { tags: [DEVICE.id] }),
        ally("far", { side: "enemy", x: 0.5, y: 0, attributes: { hp: 10 } }),
        ally("near", { side: "enemy", x: 0.3, y: 0, attributes: { hp: 10 } }),
      ],
    }),
    [blockModule],
  )
  battle.step()
  const units = battle.snapshot().units
  expect(units.find((unit) => unit.id === "far")?.blockedBy).toBeNull()
  expect(units.find((unit) => unit.id === "near")?.blockedBy).toBe("a")
})

test("围栏上的单位挡不住地面敌人，挡得住带 blockFly 的飞行敌人", () => {
  const fence = { x: 0, y: 0, height: 0, deployable: true, walkableBy: ["fly"] }
  const battle = createBattle(
    spec({
      modules: ["block"],
      tiles: [fence, { x: 1, y: 0, height: 0, deployable: true, walkableBy: ["ground"] }],
      units: [
        ally("a", { tags: [BLOCK_FLY.id] }),
        ally("ground", { side: "enemy", x: 0.2, y: 0, attributes: { hp: 10, moveSpeed: 0 } }),
        ally("air", { side: "enemy", x: 0.2, y: 0.1, motion: "FLY", attributes: { hp: 10, moveSpeed: 0 } }),
      ],
    }),
    [blockModule],
  )
  battle.step()
  const units = battle.snapshot().units
  expect(units.find((unit) => unit.id === "ground")?.blockedBy).toBeNull()
  expect(units.find((unit) => unit.id === "air")?.blockedBy).toBe("a")
})

test("解除阻挡后隐匿过 STEALTH_RESTORE 秒才恢复", () => {
  const prep: MissionModule = {
    id: "prep",
    install(ctx) {
      ctx.registerSystem({
        id: "prep",
        slot: "schedule",
        priority: 0,
        run(runCtx) {
          if (runCtx.tick() === 0) runCtx.applyStatus("e", "stealth")
          if (runCtx.tick() === 1) runCtx.applyStatus("a", "stun")
        },
      })
    },
  }
  const battle = createBattle(
    spec({
      modules: ["block", "prep"],
      tiles: lane,
      units: [
        ally("a"),
        ally("e", { side: "enemy", x: 0.2, y: 0, attributes: { hp: 10, moveSpeed: 0 } }),
      ],
    }),
    [blockModule, prep],
  )
  battle.step()
  expect(battle.snapshot().units.find((unit) => unit.id === "e")?.blockedBy).toBe("a")
  battle.step()
  const revealed = battle.snapshot().units.find((unit) => unit.id === "e")
  expect(revealed?.blockedBy).toBeNull()
  expect(revealed?.tags).toContain("stealth-off")
  const ticks = Math.round(STEALTH_RESTORE / (1 / 30))
  for (let step = 0; step < ticks; step += 1) battle.step()
  expect(battle.snapshot().units.find((unit) => unit.id === "e")?.tags).not.toContain("stealth-off")
})
