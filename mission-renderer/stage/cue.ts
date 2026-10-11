import type { AssetKey } from "arknights-assets-catalog"
import type { BattleEvent, UnitSnapshot } from "arknights-mission-core"
import type { MissionAudioCue } from "#contract/event.js"

export type EffectAudioFor = (
  event: BattleEvent,
  type: MissionAudioCue["type"],
) => AssetKey | null

const AUDIO_TYPES: Readonly<Record<string, MissionAudioCue["type"]>> = {
  attack: "attack",
  "attack-hit": "hit",
  "skill-start": "skill",
  damaged: "damage",
  fatal: "downed",
  hit: "hit",
  "element-hit": "element",
  "element-burst": "element",
  projectile: "projectile",
  status: "status",
  heal: "heal",
  downed: "downed",
  deploy: "deploy",
  leak: "leak",
}

function stringValue(data: Readonly<Record<string, unknown>>, key: string): string | undefined {
  return typeof data[key] === "string" ? data[key] : undefined
}

/** The audio cue of a battle event, or null when the event has no sound. */
export function audioCueFor(event: BattleEvent, audioFor?: EffectAudioFor): MissionAudioCue | null {
  const type = AUDIO_TYPES[event.type]
  if (!type) return null
  const unitId = stringValue(event.data, "unitId")
  const targetId = stringValue(event.data, "targetId")
  const asset = audioFor?.(event, type) ?? null
  return {
    type,
    eventType: event.type,
    ...(unitId ? { unitId } : {}),
    ...(targetId ? { targetId } : {}),
    ...(asset ? { asset } : {}),
  }
}

/**
 * The audio cue of an event. A stage device going down breaks apart instead of falling, so its `downed` cue is a
 * `break` cue; `units` is the current frame, where the unit's kind is read.
 */
export function effectCueFor(
  event: BattleEvent,
  units: readonly UnitSnapshot[],
  audioFor?: EffectAudioFor,
): MissionAudioCue | null {
  const cue = audioCueFor(event, audioFor)
  if (!cue || cue.type !== "downed" || !cue.unitId) return cue
  const unit = units.find((candidate) => candidate.id === cue.unitId)
  return unit?.kind === "device" ? { ...cue, type: "break" } : cue
}
