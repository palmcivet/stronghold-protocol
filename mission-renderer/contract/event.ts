import type { AssetKey } from "arknights-assets-catalog"

export type MissionPointerHit =
  | { readonly type: "unit"; readonly unitId: string }
  | { readonly type: "tile"; readonly x: number; readonly y: number }
  | { readonly type: "empty" }

export interface MissionAudioCue {
  readonly type:
    | "attack"
    | "hit"
    | "skill"
    | "damage"
    | "heal"
    | "downed"
    | "break"
    | "deploy"
    | "leak"
    | "element"
    | "status"
    | "projectile"
  readonly eventType: string
  readonly unitId?: string
  readonly targetId?: string
  readonly asset?: AssetKey
}
