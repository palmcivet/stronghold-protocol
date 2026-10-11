import { expect, test } from "vitest"
import { createBattle, defineEffect, type ContentContext, type MissionModule } from "arknights-mission-core"
import { engineOf } from "#unit/record/index.js"
import { absoluteRangeTiles } from "#combat/target/selector.js"
import { gridOf } from "#field/grid/index.js"
import { ally, spec } from "#test/fixture.js"

const tiles = [0, 1, 2].flatMap((y) => Array.from({ length: 8 }, (_, x) => ({ x, y, height: 0, deployable: true, walkableBy: ["ground"] })))
const reach = defineEffect("case-reach", { modifiers: [{ attribute: "rangeExtend", op: "add", value: 1 }] })

/** 同一拍里连着改位置、朝向、延伸和额外格子，每次改完马上查，范围格子都跟着变；不改时拿到的是同一份。 */
test("攻击范围格子的缓存在位置、朝向、延伸格数和额外格子变化时重算，没变时复用", () => {
  const reads: string[][] = []
  let reused = false
  const probe: MissionModule = {
    id: "case",
    install(ctx) {
      ctx.registerEffect(reach)
      ctx.registerSystem({
        id: "probe",
        slot: "schedule",
        priority: 1,
        run(runCtx: ContentContext) {
          if (runCtx.tick() !== 0) return
          const { world, registry } = engineOf(runCtx)
          const grid = gridOf(world)
          const unit = world.units.get("a")
          if (!unit) throw new Error("no a")
          const read = () => [...absoluteRangeTiles(grid, "a", world, registry)].sort()
          const first = absoluteRangeTiles(grid, "a", world, registry)
          reused = absoluteRangeTiles(grid, "a", world, registry) === first
          reads.push(read())
          runCtx.displace("a", 2, 1)
          reads.push(read())
          unit.facing = "UP"
          reads.push(read())
          unit.facing = "RIGHT"
          reads.push(read())
          runCtx.applyEffect("a", "case-reach")
          reads.push(read())
          runCtx.setExtraRange("a", [{ x: 7, y: 2 }])
          reads.push(read())
          runCtx.setExtraRange("a", null)
          runCtx.removeEffect("a", "case-reach")
          runCtx.displace("a", 1, 1)
          reads.push(read())
        },
      })
    },
  }
  createBattle(spec({ modules: ["case"], tiles, units: [ally("a", { x: 1, y: 1, attackRange: [{ x: 1, y: 0 }] })] }), [probe]).step()
  expect(reused).toBe(true)
  expect(reads).toEqual([["2,1"], ["3,1"], ["2,2"], ["3,1"], ["3,1", "4,1"], ["3,1", "4,1", "7,2"], ["2,1"]])
})
