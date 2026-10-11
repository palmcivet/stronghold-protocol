export const MODULE_ID: 'arknights-mission-core' = 'arknights-mission-core';

export {
  defineAttribute,
  MULTIPLIER_ATTRIBUTES,
} from '#ability/effect/attribute.js';
export {
  defineCondition,
  ENEMIES_IN_RANGE,
} from '#ability/effect/condition.js';
export { defineEffect, type EffectOptions } from '#ability/effect/index.js';
export { STACKINGS } from '#ability/effect/stacking.js';
export { BUILTIN_SKILL_BODIES } from '#ability/skill/body.js';
export { AUTO_OP_COOLDOWN } from '#ability/skill/constants.js';
export { type Battle, createBattle } from '#battle/create.js';
export {
  createFrameClock,
  FRAME_CATCHUP,
  type FrameClock,
} from '#battle/frame.js';
export { runSteps } from '#battle/headless.js';
export type { InputRefusal } from '#battle/input.js';
export {
  type AttackImpact,
  type AttackResolver,
  BOOMERANG_RETURN_SPEED,
  CHAIN_HEAL_REACH,
  PROJECTILE_KIND_SPEEDS,
  PROJECTILE_RETAIN,
  PROJECTILE_RETURN_SPEEDS,
  registerAttackResolver,
} from '#combat/attack/shape.js';
export type { AttackStandView } from '#combat/attack/stand.js';
export {
  AMMO_CAP,
  AMMO_CAP_ATTRIBUTE,
  AMMO_SCALE,
  AMMO_SCALE_ATTRIBUTE,
  AMMO_TIMER,
  type AttackTiming,
  BOOMERANG_TIMER,
  BOOMERANGS_OUT_ATTRIBUTE,
  CHARGE_CAP,
  CHARGE_CAP_ATTRIBUTE,
  CHARGE_TIMER,
  consumeAttackTiming,
  independentDt,
  readAttackTiming,
  setAttackTargetThisTick,
  TIMER_RATE,
  TIMER_RATE_ATTRIBUTE,
} from '#combat/attack/timing.js';
export { ELEMENT_ORDER } from '#combat/element/index.js';
export {
  PROJECTILE_MAX_AGE,
  PROJECTILE_SPEED,
} from '#combat/projectile/index.js';
export type {
  AmmoUsedEvent,
  AttackEvent,
  AttackHitEvent,
  BattleEvent,
  BattleEventMap,
  BattleEventType,
  BlockEvent,
  CostEvent,
  CueEvent,
  CueMap,
  DamagedEvent,
  DisplaceEvent,
  DownedEvent,
  ElementBurstEvent,
  ElementHitEvent,
  EventData,
  FatalEvent,
  HealEvent,
  HitEvent,
  InputEvent,
  InputRefusedEvent,
  Intercept,
  InterceptEventType,
  LossEvent,
  NoticeEventType,
  PalsyInterruptEvent,
  ProjectileEvent,
  SkillEvent,
  StatusEvent,
  UnitEvent,
} from '#contract/event.js';
export type {
  BattleInput,
  BattleInputType,
  CommandRefusal,
  RedeployOrder,
  TriggerArea,
} from '#contract/input.js';
export { BATTLE_INPUT_TYPES } from '#contract/input.js';
export { PHASE_SLOTS, type PhaseSlot } from '#contract/phase.js';
export type {
  BattleLedger,
  BattleResult,
  LedgerRow,
} from '#contract/result.js';
export type {
  BattleSnapshot,
  RedeploySnapshot,
  SkillSnapshot,
  UnitSnapshot,
} from '#contract/snapshot.js';
export type {
  AttackClip,
  AttackDamageKind,
  AttackShape,
  BattleSpec,
  BounceShape,
  ChainHealShape,
  ConditionalEffectSpec,
  CostPoolSpec,
  Direction,
  HitArea,
  Motion,
  ProjectileKind,
  RouteCheckpoint,
  RouteSpec,
  SkillHooks,
  SkillModifier,
  SkillMoment,
  SkillOperation,
  SkillSpec,
  SpawnSpec,
  SplashShape,
  SpType,
  TileCoord,
  TileSpec,
  UnitAttributes,
  UnitKind,
  UnitSide,
  UnitSpec,
} from '#contract/spec.js';
export {
  ATTACK_DAMAGE_KINDS,
  DIRECTIONS,
  MOTIONS,
  PROJECTILE_KINDS,
  SKILL_OPERATIONS,
  SP_TYPES,
  UNIT_KINDS,
  UNIT_SIDES,
} from '#contract/spec.js';
export { costModule } from '#economy/index.js';
export {
  bodyDist,
  bodyInKeys,
  bodyInRadius,
  bodyKeys,
  bodyOnTile,
  bodyRect,
} from '#field/body/index.js';
export {
  frontTile,
  offsetTile,
  oppositeDirection,
  rotateOffset,
} from '#field/direction/index.js';
export type { FieldGrid, GridPoint } from '#field/grid/index.js';
export { createGrid } from '#field/grid/index.js';
export { attractPoints } from '#field/motion/attract.js';
export {
  fearReachableTiles,
  fearSteps,
  planFearMove,
} from '#field/motion/fear.js';
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
} from '#field/motion/index.js';
export { createRandom, deriveSeed, type Random } from '#kernel/random/index.js';
export {
  ExtensionRefusedError,
  RegistrationConflictError,
  UnknownRegistrationError,
} from '#kernel/registry/error.js';
export {
  defineExtensible,
  type ExtensibleKey,
  type ExtensibleOptions,
  type ExtensionKind,
  type ExtensionRecord,
} from '#kernel/registry/extensible.js';
export { TICK } from '#kernel/tick/index.js';
export type { TimerState, TimerView } from '#kernel/timer/index.js';
export {
  type ComponentAccess,
  type ComponentCodec,
  type ComponentKey,
  type ComponentOptions,
  defineComponent,
} from '#kernel/world/component.js';
export {
  defineResource,
  type ResourceAccess,
  type ResourceKey,
} from '#kernel/world/resource.js';
export { defineTag, type TagKey, type TagOptions } from '#kernel/world/tag.js';
export type {
  ContentContext,
  EventRevision,
  GainSpOptions,
  HealOptions,
  HitShape,
  UnitView,
} from '#port/context.js';
export type {
  AttributeDefinition,
  AttributeModifier,
  ConditionDefinition,
  ContentTimerDefinition,
  DamageInfo,
  DamageModifierDefinition,
  DamageOrigin,
  DamagePass,
  DamagePreview,
  DamageStage,
  DamageStepDefinition,
  DeployStrategyDefinition,
  EffectApplication,
  EffectChange,
  EffectDefinition,
  EffectIncoming,
  EffectRecord,
  EffectWait,
  ElementDefinition,
  ExtensibleContract,
  ExtensibleDefinitions,
  HitChange,
  HpChange,
  PhaseSystem,
  ProjectileImpact,
  ProjectileLaunch,
  ProjectileView,
  SelectorDefinition,
  SelectorQuery,
  ShiftDefinition,
  ShiftInput,
  ShiftPlan,
  SkillBodyDefinition,
  SkillHookDefinition,
  SkillRuntime,
  SkillTriggerDefinition,
  StackingDefinition,
  SystemOrderEntry,
} from '#port/definition.js';
export {
  DAMAGE_STAGES,
  EXTENSIBLE_CONTRACTS,
  MODIFIER_OPS,
  type ModifierOp,
} from '#port/definition.js';
export type { LoadoutRequest, ResolvedRecordLoadout } from '#port/loadout.js';
export {
  attackRangeGrid,
  composeStats,
  composeTalents,
  extendedGrid,
  loadoutRecord,
  resolveRecordLoadout,
  traitRangeExtend,
} from '#port/loadout.js';
export type { MissionModule, Registration } from '#port/module.js';
export {
  AIRBORNE,
  ALLY_TARGET,
  ATTACK_MOVES,
  ATTRACT,
  BIND,
  BLOCK_FLY,
  BURST_LOCK,
  CAMOU,
  CAN_HIT_FLY,
  CANNOT_ACT,
  CANNOT_ATTACK,
  CANNOT_CAST,
  COLD,
  CORE_TAGS,
  DEFER_DEPLOY,
  DEVICE,
  DISARM,
  FEAR,
  FLOAT,
  FREEZE,
  GROUNDBIND,
  HEAL_FREE,
  HIDDEN,
  HIT_COUNT,
  HIT_COUNT_ARTS,
  HIT_SLEEP,
  INVULNERABLE,
  ISOLATED,
  LEVITATE,
  LIFTOFF,
  NO_ALLY_HEAL,
  NO_ATTACK,
  NO_BLOCK,
  NO_DISPLACE,
  NO_HEAL,
  NO_MOVE,
  NO_SP,
  REVEAL,
  SILENCE,
  SLEEP,
  STATIC_BODY,
  STEALTH,
  STEALTH_OFF,
  STUN,
  TOKEN,
  TREMBLE,
  UNBLOCKABLE,
  UNTARGETABLE,
} from '#port/tag.js';
export {
  BLOCK_RADIUS,
  BLOCK_RADIUS_DEVICE,
  BLOCK_RADIUS_DEVICE_SQ,
  BLOCK_RADIUS_FLY,
  BLOCK_RADIUS_FLY_SQ,
  BLOCK_RADIUS_SQ,
  blockModule,
  STEALTH_RESTORE,
} from '#unit/block/index.js';
export { DEPLOY_STRATEGY, deployModule } from '#unit/deploy/index.js';
export {
  REDEPLOY_MUL_ATTRIBUTE,
  redeployModule,
} from '#unit/deploy/redeploy.js';
export { leakModule } from '#unit/leak/index.js';
