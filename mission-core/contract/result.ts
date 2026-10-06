import type { UnitSide } from "#contract/spec.js"

export interface BattleResult {
  readonly finished: boolean
  readonly winner: UnitSide | null
}
