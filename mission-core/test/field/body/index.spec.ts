import { expect, test } from "vitest"
import {
  bodyDist,
  bodyInKeys,
  bodyInRadius,
  bodyKeys,
  bodyOnTile,
  createBattle,
  type HitShape,
  type MissionModule,
} from "arknights-mission-core"
import { ally, spec } from "#test/fixture.js"

const span = { x0: 0, y0: 0, x1: 12, y1: 12 }
const huge = {
  x: 5,
  y: 5,
  hitArea: { w: 4.95, h: 2.95, dx: 0, dy: 1 },
}
const point = { x: 5, y: 5, hitArea: null }

test("大体型占据偏移后的 5×3，点单位只占所在格", () => {
  const occupied = bodyKeys(huge, span)
  expect(occupied).toContain("3,6")
  expect(occupied).toContain("7,6")
  expect(occupied).toContain("5,5")
  expect(occupied).toContain("5,7")
  expect(occupied).not.toContain("2,6")
  expect(occupied).not.toContain("8,6")
  expect(occupied).not.toContain("5,4")
  expect(occupied).not.toContain("5,8")
  expect(occupied).toHaveLength(15)

  expect(bodyOnTile(huge, 3, 6)).toBe(true)
  expect(bodyOnTile(huge, 2, 6)).toBe(false)
  expect(bodyInKeys(huge, new Set(["7,7"]), span)).toBe(true)
  expect(bodyInKeys(point, new Set(["6,5"]), span)).toBe(false)
  expect(bodyOnTile(point, 5, 5)).toBe(true)
  expect(bodyOnTile(point, 6, 5)).toBe(false)
  expect(bodyOnTile(point, 5, 6)).toBe(false)

  expect(bodyDist(huge, 5, 6)).toBe(0)
  expect(bodyInRadius(huge, 7.6, 6, 0.1)).toBe(false)
  expect(bodyInRadius(huge, 7.6, 6, 0.2)).toBe(true)
  expect(bodyInRadius(point, 6, 5, 0.2)).toBe(false)
  expect(bodyDist(point, 5.6, 5)).toBeCloseTo(0.6)
  expect(bodyInRadius(point, 5.6, 5, 0.2)).toBe(false)
})

test("范围里的一格能命中跨格身体，邻格打不中点单位", () => {
  const seen: string[] = []
  let hugeRect: HitShape = { kind: "rect", x: 0, y: 0, w: 0, h: 0 }
  let pointRect: HitShape = { kind: "tile", x: 0, y: 0, w: 1, h: 1 }
  const probe: MissionModule = {
    id: "probe",
    install(ctx) {
      ctx.registerSelector({
        id: "all",
        filter() {
          return true
        },
        compare() {
          return 0
        },
      })
      ctx.registerSystem({
        id: "query",
        slot: "schedule",
        priority: 0,
        run(runCtx) {
          seen.push(...runCtx.unitsInRange("attacker", "all"))
          hugeRect = runCtx.hitRect("huge")
          pointRect = runCtx.hitRect("beside")
        },
      })
    },
  }
  const battle = createBattle(
    spec({
      modules: ["probe"],
      tiles: [
        { x: 0, y: 0, height: 0, deployable: true, walkableBy: ["WALK"] },
        { x: 2, y: 0, height: 0, deployable: true, walkableBy: ["WALK"] },
        { x: 2, y: 1, height: 0, deployable: true, walkableBy: ["WALK"] },
        { x: 4, y: 0, height: 0, deployable: true, walkableBy: ["WALK"] },
      ],
      units: [
        ally("attacker", { attackRange: [{ x: 2, y: 0 }] }),
        ally("huge", {
          side: "enemy",
          x: 4,
          y: 0,
          hitArea: { w: 4.95, h: 1, dx: 0, dy: 0 },
        }),
        ally("beside", { side: "enemy", x: 2, y: 1 }),
        ally("inside-body", { side: "enemy", x: 3, y: 0 }),
      ],
    }),
    [probe],
  )
  battle.step()
  expect(seen).toEqual(["huge"])
  expect(hugeRect).toMatchObject({ kind: "rect", w: 4.95, h: 1 })
  expect(pointRect).toEqual({ kind: "tile", x: 1.5, y: 0.5, w: 1, h: 1 })
})
