import { test } from "vitest"
import { createBattle } from "arknights-mission-core"
import { SCENARIOS } from "#test/golden/scenario.js"

/** 每个黄金场景从头推进 600 帧算一次。只看耗时，不设门槛。 */
const FRAMES = 600

function runOnce(scenario: (typeof SCENARIOS)[number]): number {
  const battle = createBattle(scenario.spec(), scenario.modules())
  let events = 0
  for (let frame = 0; frame < FRAMES; frame += 1) {
    battle.step()
    events += battle.drainEvents().length
  }
  return events
}

test("黄金场景各推进 600 帧", async ({ bench }) => {
  let sink = 0
  await bench.compare(
    ...SCENARIOS.map((scenario) =>
      bench(scenario.name, () => {
        sink += runOnce(scenario)
      }),
    ),
    { iterations: 20 },
  )
  if (sink < 0) throw new Error("事件数不会是负数")
})
