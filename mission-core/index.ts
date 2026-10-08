export const MODULE_ID: "arknights-mission-core" = "arknights-mission-core"

export { PHASE_SLOTS, type PhaseSlot } from "#contract/phase.js"
export type {
  BattleSpec,
  Direction,
  HitArea,
  Motion,
  RouteCheckpoint,
  RouteSpec,
  AttackClip,
  AttackDamageKind,
  AttackShape,
  BounceShape,
  ChainHealShape,
  ProjectileKind,
  SplashShape,
  SkillHook,
  SkillModifier,
  SkillMoment,
  SkillOperation,
  SkillSpec,
  CostPoolSpec,
  SpawnSpec,
  SpType,
  TileCoord,
  TileSpec,
  UnitAttributes,
  UnitKind,
  UnitSide,
  UnitSpec,
} from "#contract/spec.js"
export { ATTACK_DAMAGE_KINDS, DIRECTIONS, MOTIONS, PROJECTILE_KINDS, SKILL_OPERATIONS, SP_TYPES, UNIT_KINDS, UNIT_SIDES } from "#contract/spec.js"
export type { BattleEvent } from "#contract/event.js"
export type { BattleResult } from "#contract/result.js"
export type { BattleSnapshot, UnitSnapshot } from "#contract/snapshot.js"

export { TICK } from "#tick/index.js"
export { AUTO_OP_COOLDOWN } from "#battle/skill/constants.js"

export { createRandom, deriveSeed, type Random } from "#random/index.js"
export {
  attackRangeGrid,
  composeStats,
  composeTalents,
  extendedGrid,
  loadoutRecord,
  resolveRecordLoadout,
  traitRangeExtend,
} from "#port/loadout.js"
export type { LoadoutRequest, ResolvedRecordLoadout } from "#port/loadout.js"

export { UnknownRegistrationError } from "#port/unknown-registration.js"
export { MODIFIER_OPS, type ModifierOp } from "#port/content.js"
export type {
  AttributeModifier,
  ContentContext,
  DamageInfo,
  DamagePreview,
  HealOptions,
  DamageStepDefinition,
  DeployStrategyDefinition,
  ElementDefinition,
  EventRevision,
  HitShape,
  MissionModule,
  PhaseSystem,
  ProjectileImpact,
  ProjectileLaunch,
  ProjectileView,
  Registration,
  SelectorDefinition,
  SkillBodyDefinition,
  SkillRuntime,
  ShiftDefinition,
  ShiftInput,
  ShiftPlan,
  SkillTriggerDefinition,
  StatusApplication,
  StatusDefinition,
  StatusIncoming,
  TimerDefinition,
  TimerState,
  TimerView,
  UnitView,
} from "#port/content.js"

export { frontTile, offsetTile, oppositeDirection, rotateOffset } from "#battle/space/direction/index.js"
export { bodyDist, bodyInKeys, bodyInRadius, bodyKeys, bodyOnTile, bodyRect } from "#battle/space/body/index.js"
export { createGrid } from "#battle/space/grid/index.js"
export type { FieldGrid, GridPoint } from "#battle/space/grid/index.js"
export { attractPoints, fearReachableTiles, fearSteps, planFearMove } from "#battle/behavior/shift.js"
export {
  PULL_CRAWL,
  PULL_ORIGIN,
  PULL_STOP_RADIUS,
  PULL_WEAK_SHARE,
  PUSH_DIRECTIONAL_MIN_DIST,
  PUSH_TILES,
  PUSH_TILES_EFFECT,
  SHIFT_ATTRACT,
  SHIFT_FEAR,
  SHIFT_PULL,
  SHIFT_PUSH,
} from "#battle/behavior/action.js"
export { BUILTIN_SKILL_BODIES } from "#battle/skill/body.js"
export {
  BLOCK_FLY_TAG,
  BLOCK_RADIUS,
  BLOCK_RADIUS_DEVICE,
  BLOCK_RADIUS_DEVICE_SQ,
  BLOCK_RADIUS_FLY,
  BLOCK_RADIUS_FLY_SQ,
  BLOCK_RADIUS_SQ,
  DEVICE_TAG,
  STEALTH_RESTORE,
  blockModule,
} from "#battle/block.js"
export { costModule } from "#battle/cost.js"
export { DEFER_DEPLOY_TAG, DEPLOY_STRATEGY, TOKEN_TAG, deployModule } from "#battle/deploy/board.js"
export { leakModule } from "#battle/leak.js"
export {
  BOOMERANG_RETURN_SPEED,
  CHAIN_HEAL_RADIUS,
  PROJECTILE_KIND_SPEEDS,
  PROJECTILE_RETAIN,
  PROJECTILE_RETURN_SPEEDS,
  registerAttackResolver,
  type AttackImpact,
  type AttackResolver,
} from "#battle/attack/shape.js"
export { PROJECTILE_MAX_AGE, PROJECTILE_SPEED } from "#battle/projectile/index.js"
export { REDEPLOY_MUL_ATTRIBUTE, redeployModule } from "#battle/redeploy.js"
export {
  AMMO_CAP,
  AMMO_CAP_ATTRIBUTE,
  AMMO_SCALE,
  AMMO_SCALE_ATTRIBUTE,
  AMMO_TIMER,
  BOOMERANG_TIMER,
  BOOMERANGS_OUT_ATTRIBUTE,
  CHARGE_CAP,
  CHARGE_CAP_ATTRIBUTE,
  CHARGE_TIMER,
  TIMER_RATE,
  TIMER_RATE_ATTRIBUTE,
  consumeAttackTiming,
  independentDt,
  readAttackTiming,
  setAttackTargetThisTick,
  type AttackTiming,
} from "#battle/unit/timer.js"
export { createBattle, type Battle } from "#battle/create-battle.js"

export { runSteps } from "#runner/headless.js"
export { FRAME_CATCHUP, createFrameClock, type FrameClock } from "#runner/frame.js"
