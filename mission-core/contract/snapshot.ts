import type { TileCoord, UnitAttributes, UnitSide } from "#contract/spec.js"

export interface UnitSnapshot {
  readonly id: string
  readonly side: UnitSide
  readonly x: number
  readonly y: number
  readonly attributes: UnitAttributes
  readonly flags: readonly string[]
  readonly attackRange: readonly TileCoord[]
  readonly tags: readonly string[]
  readonly deployPositions: readonly string[]
  readonly elements: Readonly<Record<string, number>>
  readonly blocking: readonly string[]
  readonly blockedBy: string | null
  /** 已经飞出、还没回到投掷者手上的回旋物数量。 */
  readonly boomerangsOut: number
}

export interface BattleSnapshot {
  readonly tick: number
  readonly units: readonly UnitSnapshot[]
}
