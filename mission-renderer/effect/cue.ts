import type { BattleEvent } from "arknights-mission-core"
import type { MissionCue, MissionCueBase, MissionCueKey } from "#contract/cue.js"

/** The cue of a battle event: keyed by its type, or by `cue:<kind>` for a `cue` event. */
export function cueFor(event: BattleEvent): MissionCue {
  const key: MissionCueKey = event.type === "cue" ? `cue:${(event.data as MissionCueBase).kind}` : event.type
  return { key, tick: event.tick, data: event.data } as MissionCue
}
