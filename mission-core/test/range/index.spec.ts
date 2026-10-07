import { expect, test } from "vitest"
import { createBattle, type Direction, type MissionModule } from "arknights-mission-core"
import { ally, spec } from "../fixture.js"

const cell = { x: 1, y: 2 }
const origin = { x: 5, y: 5 }

function place(id: string, x: number, y: number) {
  return ally(id, { side: "enemy", x, y })
}

test("范围查询按朝向返回旋转后的格子", () => {
  const targets = {
    RIGHT: place("right", 6, 7),
    UP: place("up", 3, 6),
    LEFT: place("left", 4, 3),
    DOWN: place("down", 7, 4),
  } satisfies Record<Direction, ReturnType<typeof place>>
  for (const facing of ["RIGHT", "UP", "LEFT", "DOWN"] as const) {
    const found: string[] = []
    let selectorCalls = 0
    const probe: MissionModule = {
      id: "probe",
      install(ctx) {
        ctx.registerSelector({
          id: "all",
          filter() {
            selectorCalls += 1
            return true
          },
          compare() {
            return 0
          },
        })
        ctx.registerSystem({
          id: "query",
          slot: "schedule",
          priority: 1,
          run(runCtx) {
            found.push(...runCtx.unitsInRange("origin", "all"))
          },
        })
      },
    }
    const battle = createBattle(
      spec({
        modules: ["probe"],
        tiles: [{ x: origin.x, y: origin.y, height: 0, deployable: true, walkableBy: ["ground"] }],
        units: [ally("origin", { ...origin, facing, attackRange: [cell] }), ...Object.values(targets)],
      }),
      [probe],
    )
    expect(selectorCalls).toBe(0)
    battle.snapshot()
    expect(selectorCalls).toBe(0)
    battle.step()
    expect(found).toEqual([targets[facing].id])
    const after = selectorCalls
    battle.snapshot()
    expect(selectorCalls).toBe(after)
  }
})
