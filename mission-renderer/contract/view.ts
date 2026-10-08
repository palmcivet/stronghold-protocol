import type { BattleEvent, BattleSnapshot, TileCoord, TileSpec, UnitSnapshot } from "arknights-mission-core"
import type { MissionStageCommand, MissionUpdateMode } from "./command.js"
import type { MissionPointerHit } from "./event.js"

export type { MissionStageCommand, MissionUpdateMode } from "./command.js"
export type { MissionPointerHit } from "./event.js"

export interface MissionMap {
  readonly cols: number
  readonly rows: number
  readonly tiles: readonly TileSpec[]
}

export interface MissionCamera {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly margin: number
}

export interface MissionView {
  readonly map: MissionMap | null
  readonly camera: MissionCamera | null
  readonly snapshot: BattleSnapshot | null
  readonly units: readonly UnitSnapshot[]
  readonly events: readonly BattleEvent[]
  readonly highlightedTiles: readonly TileCoord[]
  readonly updateMode: MissionUpdateMode
}

export interface MissionStage {
  readonly view: MissionView
  readonly dispatch: (command: MissionStageCommand) => void
  readonly update: (deltaSeconds: number) => void
  readonly pick: (screenX: number, screenY: number) => MissionPointerHit
  readonly resize: (width: number, height: number) => void
  readonly destroy: () => void
}
