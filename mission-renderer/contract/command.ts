import type { BattleEvent, BattleSnapshot, TileCoord } from "arknights-mission-core"
import type { MissionCamera, MissionMap } from "./view.js"

/**
 * `external`: snapshots and events apply as they are pushed. `local`: a local simulation pushes a frame every
 * animation frame; the stage renders at a clock that trails the newest frame by `delay` real seconds and advances at
 * `speed` game seconds per real second.
 */
export type MissionUpdateMode = "external" | "local"

export type MissionStageCommand =
  | { readonly type: "set-map"; readonly map: MissionMap }
  | { readonly type: "set-camera"; readonly camera: MissionCamera }
  | { readonly type: "set-highlights"; readonly tiles: readonly TileCoord[] }
  | { readonly type: "set-update-mode"; readonly mode: MissionUpdateMode; readonly speed?: number; readonly delay?: number }
  | { readonly type: "push-snapshot"; readonly snapshot: BattleSnapshot }
  | { readonly type: "push-event"; readonly event: BattleEvent }
  | { readonly type: "reset" }
