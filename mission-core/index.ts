export const moduleId: "arknights-mission-core" = "arknights-mission-core"

export { phaseSlots, type PhaseSlot } from "#contract/phase.js"
export type {
  BattleSpec,
  Direction,
  HitArea,
  Motion,
  RouteCheckpoint,
  RouteSpec,
  AttackClip,
  SkillHook,
  SkillModifier,
  SkillMoment,
  SkillOperation,
  SkillSpec,
  SpawnSpec,
  SpType,
  TileCoord,
  TileSpec,
  UnitAttributes,
  UnitSide,
  UnitSpec,
} from "#contract/spec.js"
export { directions, motions, skillOperations, spTypes, unitSides } from "#contract/spec.js"
export type { BattleEvent } from "#contract/event.js"
export type { BattleResult } from "#contract/result.js"
export type { BattleSnapshot, UnitSnapshot } from "#contract/snapshot.js"

export { TICK } from "#tick/index.js"
export { AUTO_OP_COOLDOWN } from "#battle/skill/constants.js"

export { createRandom, deriveSeed, type Random } from "#random/index.js"

export { UnknownRegistrationError } from "#port/unknown-registration.js"
export { modifierOps, type ModifierOp } from "#port/content.js"
export type {
  AttributeModifier,
  ContentContext,
  DamageInfo,
  DamagePreview,
  HealOptions,
  DamageStepDefinition,
  DeployStrategyDefinition,
  ElementDefinition,
  HitShape,
  MissionModule,
  PhaseSystem,
  ProjectileLaunch,
  Registration,
  SelectorDefinition,
  SkillBodyDefinition,
  SkillRuntime,
  SkillTriggerDefinition,
  StatusApplication,
  StatusDefinition,
  StatusIncoming,
  TimerDefinition,
  TimerState,
  TimerView,
} from "#port/content.js"

export { rotateOffset } from "#battle/space/direction/index.js"
export { bodyDist, bodyInKeys, bodyInRadius, bodyKeys, bodyOnTile, bodyRect } from "#battle/space/body/index.js"
export { createGrid } from "#battle/space/grid/index.js"
export type { FieldGrid, GridPoint } from "#battle/space/grid/index.js"
export { attractPoints, fearReachableTiles, fearSteps, planFearMove } from "#battle/behavior/shift.js"
export { builtinSkillBodies } from "#battle/skill/body.js"
export { costModule } from "#battle/cost.js"
export { redeployModule } from "#battle/redeploy.js"
export { createBattle, type Battle } from "#battle/create-battle.js"

export { runSteps } from "#runner/headless.js"
