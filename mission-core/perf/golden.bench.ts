import { test } from "vitest"
import { createBattle } from "arknights-mission-core"
import { SCENARIOS } from "#test/golden/scenario.js"

/** 每个黄金场景从头推进的帧数与重复次数。只打印耗时，不设门槛。 */
const FRAMES = 600
const ROUNDS = 20

function runOnce(scenario: (typeof SCENARIOS)[number]): void {
  const battle = createBattle(scenario.spec(), scenario.modules())
  for (let frame = 0; frame < FRAMES; frame += 1) {
    battle.step()
    battle.drainEvents()
  }
}

test("黄金场景各推进 600 帧的耗时", () => {
  for (const scenario of SCENARIOS) runOnce(scenario)
  const rows: string[] = []
  let total = 0
  for (const scenario of SCENARIOS) {
    const started = performance.now()
    for (let round = 0; round < ROUNDS; round += 1) runOnce(scenario)
    const each = (performance.now() - started) / ROUNDS
    total += each
    rows.push(`${scenario.name.padEnd(12)} ${each.toFixed(2).padStart(8)} ms`)
  }
  rows.push(`${"total".padEnd(12)} ${total.toFixed(2).padStart(8)} ms`)
  console.log(`golden scenarios, ${FRAMES} frames each, mean of ${ROUNDS} rounds\n${rows.join("\n")}`)
})
