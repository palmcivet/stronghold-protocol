import type { MissionEffectKind } from "#effect/table.js"
import { createPulseKind } from "#effect/pulse.js"

/** A flash under a unit that takes damage. */
const HIT_FLASH = createPulseKind({
  id: "mission:hit-flash",
  accepts: ["damaged"],
  anchor: (cue) => (cue.data.applied > 0 ? cue.data.targetId : null),
  shape: "disc",
  color: 0xff6040,
  seconds: 0.2,
  radius: [0.15, 0.35],
  lift: 0.02,
})

/** A flash under a unit that is healed. */
const HEAL_FLASH = createPulseKind({
  id: "mission:heal-flash",
  accepts: ["heal"],
  anchor: (cue) => (cue.data.amount > 0 ? cue.data.unitId : null),
  shape: "disc",
  color: 0x60ff90,
  seconds: 0.35,
  radius: [0.2, 0.4],
  lift: 0.02,
})

/** A ring spreading from a unit as it is deployed. */
const DEPLOY_RING = createPulseKind({
  id: "mission:deploy-ring",
  accepts: ["deploy"],
  anchor: (cue) => cue.data.unitId,
  shape: "ring",
  color: 0x9fd8ff,
  seconds: 0.5,
  radius: [0.2, 0.6],
  lift: 0.01,
})

/** The engine's effect kinds, registered in every new effect table. */
export const MISSION_EFFECT_KINDS: readonly MissionEffectKind[] = Object.freeze([
  HIT_FLASH,
  HEAL_FLASH,
  DEPLOY_RING,
] as unknown as MissionEffectKind[])
