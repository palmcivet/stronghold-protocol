import { describe, expect, test } from "vitest"
import { createBattle, type Battle } from "arknights-mission-core"
import { SCENARIOS } from "#test/golden/scenario.js"
import { digest, stateOf } from "#test/replay.js"

/** 推进 ticks 拍，记下每拍的事件摘要与最后的快照摘要、结果与账本。 */
function run(battle: Battle, ticks: number): { events: string[]; snapshot: string; result: unknown; ledger: unknown } {
  const events: string[] = []
  for (let tick = 0; tick < ticks; tick += 1) {
    battle.step()
    events.push(digest(battle.drainEvents()))
  }
  return { events, snapshot: digest(stateOf(battle.snapshot())), result: battle.result(), ledger: battle.ledger() }
}

describe("export 与 import", () => {
  for (const scenario of SCENARIOS) {
    test(`${scenario.name}: 中途导出再导入继续推进，与不中断推进一致`, () => {
      const half = Math.floor(scenario.ticks / 2)
      const straight = createBattle(scenario.spec(), scenario.modules())
      run(straight, half)
      const expected = run(straight, scenario.ticks - half)

      const first = createBattle(scenario.spec(), scenario.modules())
      run(first, half)
      const archive = JSON.parse(JSON.stringify(first.export(), (_key, value) => (value === Infinity ? "∞" : value === -Infinity ? "-∞" : value)), (_key, value) =>
        value === "∞" ? Infinity : value === "-∞" ? -Infinity : value,
      )
      const resumed = createBattle(scenario.spec(), scenario.modules(), archive)
      expect(digest(stateOf(resumed.snapshot()))).toBe(digest(stateOf(first.snapshot())))
      expect(resumed.drainEvents()).toEqual([])
      expect(run(resumed, scenario.ticks - half)).toEqual(expected)
    })
  }

  test("导出与世界不共享对象", () => {
    const scenario = SCENARIOS[0]
    if (!scenario) throw new Error("no scenario")
    const battle = createBattle(scenario.spec(), scenario.modules())
    battle.step()
    const archive = battle.export()
    const before = JSON.stringify(archive)
    for (let tick = 0; tick < 30; tick += 1) battle.step()
    expect(JSON.stringify(archive)).toBe(before)
  })
})
