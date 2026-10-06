import type { BattleResult } from "#contract/result.js"
import type { Battle } from "#battle/create-battle.js"

/** 连续推进若干拍。 */
export function runSteps(battle: Battle, steps: number): BattleResult {
  for (let index = 0; index < steps; index += 1) battle.step()
  return battle.result()
}
