import type { AssetKey } from "arknights-assets-catalog"

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
