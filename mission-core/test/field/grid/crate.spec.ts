import { expect, test } from "vitest"
import { blockModule, createBattle, DEVICE, type MissionModule, type TileSpec } from "arknights-mission-core"
import { ally, spec } from "#test/fixture.js"

function lane(rows: number): TileSpec[] {
  return Array.from({ length: rows }, (_, y) => Array.from({ length: 7 }, (_, x) => ({ x, y, height: 0, deployable: true, walkableBy: ["ground"] }))).flat()
}

/** 关卡把箱子摆在 (3, 0)：格子上放箱子障碍，再放一个装置单位；装置倒下时内容拿掉障碍。 */
function crateRun(rows: number) {
  const seen = { touched: false, reached: false, blocked: false, crateDown: false, cleared: false }
  const module: MissionModule = {
    id: "stage",
    install(ctx) {
      ctx.registerSystem({
        id: "stage-crate",
        slot: "schedule",
        priority: 0,
        run: (runCtx) => {
          if (runCtx.tick() === 0) runCtx.setObstacle(3, 0, true, "crate")
        },
      })
      ctx.subscribe("downed", (event, runCtx) => {
        if (event.data.unitId !== "crate") return
        seen.crateDown = true
        runCtx.setObstacle(3, 0, false, "crate")
      })
      ctx.subscribe("blocked", (event) => {
        if (event.data.blockerId === "crate") seen.blocked = true
      })
      ctx.registerSystem({
        id: "stage-watch",
        slot: "finale",
        priority: 0,
        run: (runCtx) => {
          const unit = runCtx.unit("e")
          if (unit && Math.round(unit.x) === 3 && Math.round(unit.y) === 0) seen.touched = true
          if (unit && unit.x < 1e-6 && unit.y === 0) seen.reached = true
        },
      })
    },
  }
  const battle = createBattle(
    spec({
      modules: ["block", "stage"],
      tiles: lane(rows),
      units: [
        ally("crate", { kind: "device", x: 3, y: 0, tags: [DEVICE.id], attackRange: [], attributes: { hp: 300, atk: 0, def: 0, blockCnt: 1 } }),
        ally("e", {
          side: "enemy",
          x: 6,
          y: 0,
          timers: ["attack"],
          attackRange: [],
          attributes: { hp: 1e6, atk: 100, def: 0, moveSpeed: 2, blockWeight: 1, bat: 1 },
          route: { checkpoints: [], end: { x: 0, y: 0 } },
        }),
      ],
    }),
    [blockModule, module],
  )
  for (let tick = 0; tick < 900 && !seen.reached; tick += 1) battle.step()
  return seen
}

test("箱子在战斗里：有绕路时绕开，不踩箱子的格子", () => {
  const seen = crateRun(2)
  expect(seen.touched).toBe(false)
  expect(seen.blocked).toBe(false)
  expect(seen.reached).toBe(true)
})

test("箱子在战斗里：没有绕路时走进箱子，被箱子挡住，打碎它后接着走", () => {
  const seen = crateRun(1)
  expect(seen.blocked).toBe(true)
  expect(seen.crateDown).toBe(true)
  expect(seen.touched).toBe(true)
  expect(seen.reached).toBe(true)
})
