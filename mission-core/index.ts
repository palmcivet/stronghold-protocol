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

export { TICK } from "#kernel/tick/index.js"
export { AUTO_OP_COOLDOWN } from "#ability/skill/constants.js"

export { createRandom, deriveSeed, type Random } from "#kernel/random/index.js"
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

export { UnknownRegistrationError } from "#kernel/registry/error.js"
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

export { frontTile, offsetTile, oppositeDirection, rotateOffset } from "#field/direction/index.js"
export { bodyDist, bodyInKeys, bodyInRadius, bodyKeys, bodyOnTile, bodyRect } from "#field/body/index.js"
export { createGrid } from "#field/grid/index.js"
export type { FieldGrid, GridPoint } from "#field/grid/index.js"
export { attractPoints, fearReachableTiles, fearSteps, planFearMove } from "#field/motion/fear.js"
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
} from "#field/motion/index.js"
export { BUILTIN_SKILL_BODIES } from "#ability/skill/body.js"
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
} from "#unit/block/index.js"
export { costModule } from "#economy/index.js"
export { DEFER_DEPLOY_TAG, DEPLOY_STRATEGY, TOKEN_TAG, deployModule } from "#unit/deploy/index.js"
export { leakModule } from "#unit/leak/index.js"
export {
  BOOMERANG_RETURN_SPEED,
  CHAIN_HEAL_RADIUS,
  PROJECTILE_KIND_SPEEDS,
  PROJECTILE_RETAIN,
  PROJECTILE_RETURN_SPEEDS,
  registerAttackResolver,
  type AttackImpact,
  type AttackResolver,
} from "#combat/attack/shape.js"
export { PROJECTILE_MAX_AGE, PROJECTILE_SPEED } from "#combat/projectile/index.js"
export { REDEPLOY_MUL_ATTRIBUTE, redeployModule } from "#unit/deploy/redeploy.js"
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
} from "#kernel/timer/index.js"
export { createBattle, type Battle } from "#battle/create.js"

export { runSteps } from "#battle/headless.js"
export { FRAME_CATCHUP, createFrameClock, type FrameClock } from "#battle/frame.js"
