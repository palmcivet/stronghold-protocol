import type { Direction, HitArea, Motion, SkillHook, SkillModifier, UnitKind, UnitSpec } from "#contract/spec.js"
import type { AttributeModifier, BattleRegistry, SkillRuntime } from "#port/definition.js"
import type { ContentContext } from "#port/context.js"
import { AIRBORNE } from "#port/tag.js"
import type { TimerState } from "#kernel/timer/index.js"
import { requireEntity, type World } from "#kernel/world/index.js"
import { defineResource } from "#kernel/world/resource.js"
import { createTagGrants, grantTag, hasTag, heldTagIds, type TagGrants } from "#kernel/world/tag.js"
import { copyModifiers } from "#ability/skill/modifier.js"
import {
  isSkillOperation,
  isSpType,
  normalizeTrigger,
  type SkillOperation,
  type SpType,
} from "#ability/skill/constants.js"
import { ROUTE, compileRoute } from "#field/grid/route.js"
import { gridOf } from "#field/grid/index.js"
import { ATTACK_PROFILE, profileFromSpec } from "#combat/attack/profile.js"
import { BLOCK } from "#unit/block/hold.js"
import { TARGET_PRIORITY } from "#combat/target/priority.js"
import { HIT_LIMIT } from "#combat/damage/limit.js"
import { IMMUNITY } from "#ability/effect/immunity.js"

export interface StatusInstance {
  id: string
  stacks: number
  remaining: number
  permanent: boolean
  shield: number
  shieldHits: number
  runtimeModifiers: AttributeModifier[]
  pulse: number
  /** 这次施加之前已经在身上。 */
  carried: boolean
  /** 刷新前剩下的拍数。一直持续记成 Infinity。 */
  priorRemaining: number
  /** 取最高、抵抗用的强度。没有时是 0。 */
  strength: number
  dropped: boolean
  /** 弱的一次等强的结束再续上。until 是战场拍数。 */
  tail: { value: number; until: number } | null
}

/** 空中单位：飞行，或敌人正浮空、近地悬浮。 */
export function isFlying(unit: UnitState): boolean {
  if (unit.motion === "FLY") return true
  if (unit.side !== "enemy") return false
  return hasTag(unit, AIRBORNE)
}

export interface SkillInstance extends SkillRuntime {
  readonly id: string
  readonly body: string
  readonly trigger: string
  readonly spCost: number
  readonly duration: number
  readonly ammoSpec: number
  readonly spType: SpType
  readonly operation: SkillOperation
  readonly initSp: number
  readonly maxCharges: number
  readonly heal: boolean
  readonly triggerAllies: boolean
  readonly triggerHpAtMost: number
  readonly triggerRange: readonly { x: number; y: number }[]
  readonly mods: readonly SkillModifier[]
  readonly skillFlags: readonly string[]
  readonly activateOnDeploy: boolean
  readonly onStart: SkillHook | null
  readonly onEnd: SkillHook | null
  readonly onTick: SkillHook | null
  readonly onHit: SkillHook | null
  sp: number
  charges: number
  opReadyAt: number
  pending: boolean
  activations: number
  effectsApplied: boolean
  hurtPending: boolean
}

export interface UnitState {
  readonly id: string
  readonly side: UnitSpec["side"]
  readonly kind: UnitKind
  readonly attributes: Record<string, number>
  readonly skills: SkillInstance[]
  readonly attackRange: readonly UnitSpec["attackRange"][number][]
  /** 规格、状态、技能与模块按来源授予的标签。 */
  readonly tags: TagGrants
  readonly deployPositions: readonly string[]
  readonly aggroSeq: number
  readonly spawnSeq: number
  /** 放入时的格子。之后的坐标可以离开这里。 */
  readonly homeX: number
  readonly homeY: number
  x: number
  y: number
  facing: Direction
  hitArea: HitArea | null
  motion: Motion
  readonly statuses: StatusInstance[]
  readonly timers: Map<string, TimerState>
  /** 规格列出的独立计时器 id。 */
  readonly listedTimers: readonly string[]
  /** 按 key 挂上的属性修饰。remaining 是还没走到的终局拍数，Infinity 一直留着。 */
  readonly modifiers: Map<string, { modifiers: readonly AttributeModifier[]; remaining: number }>
  readonly script: Readonly<Record<string, string | number | boolean>>
  readonly base: Record<string, number>
  fielded: boolean
  downed: boolean
  /** 每次部署加一。回旋物等按部署分代的记录读它。 */
  deployEpoch: number
}

function createSkill(spec: UnitSpec["skills"][number]): SkillInstance {
  const spType = spec.spType ?? "time"
  if (!isSpType(spType)) throw new Error(`未知技力类型: ${spType}`)
  const operation = spec.operation ?? "MANUAL"
  if (!isSkillOperation(operation)) throw new Error(`未知技能操作: ${operation}`)
  const limit = spec.triggerHpAtMost
  return {
    id: spec.id,
    body: spec.body,
    trigger: normalizeTrigger(spec.trigger),
    spCost: Math.max(0, spec.spCost),
    duration: spec.duration,
    ammoSpec: spec.ammo,
    spType,
    operation,
    initSp: Math.max(0, spec.initSp ?? 0),
    maxCharges: Math.max(1, Math.floor(spec.charges ?? 1)),
    heal: spec.heal === true,
    triggerAllies: spec.triggerAllies === true,
    triggerHpAtMost: limit !== undefined && limit > 0 ? limit : 1,
    triggerRange: (spec.triggerRange ?? []).map((cell) => ({ x: cell.x, y: cell.y })),
    mods: copyModifiers(spec.mods),
    skillFlags: spec.flags ? [...spec.flags] : [],
    activateOnDeploy: spec.activateOnDeploy === true,
    onStart: spec.onStart ?? null,
    onEnd: spec.onEnd ?? null,
    onTick: spec.onTick ?? null,
    onHit: spec.onHit ?? null,
    active: false,
    remaining: 0,
    ammo: 0,
    toggled: false,
    sp: 0,
    charges: 0,
    opReadyAt: Number.NEGATIVE_INFINITY,
    pending: false,
    activations: 0,
    effectsApplied: false,
    hurtPending: false,
  }
}

export function createUnit(spec: UnitSpec, fielded: boolean, order: number): UnitState {
  const attributes: Record<string, number> = {}
  const base: Record<string, number> = {}
  for (const [key, value] of Object.entries(spec.attributes)) {
    attributes[key] = value
    base[key] = value
  }
  const skills: SkillInstance[] = spec.skills.map((skill) => createSkill(skill))
  return {
    id: spec.id,
    side: spec.side,
    kind: spec.kind ?? (spec.side === "enemy" ? "enemy" : "operator"),
    attributes,
    skills,
    attackRange: spec.attackRange.map((cell) => ({ x: cell.x, y: cell.y })),
    tags: createTagGrants(),
    deployPositions: [...spec.deployPositions],
    aggroSeq: spec.aggroSeq ?? order,
    spawnSeq: order,
    homeX: Math.round(spec.x),
    homeY: Math.round(spec.y),
    x: spec.x,
    y: spec.y,
    facing: spec.facing ?? "RIGHT",
    hitArea: spec.hitArea ?? null,
    motion: spec.motion ?? "WALK",
    statuses: [],
    timers: new Map(),
    listedTimers: spec.timers ? [...spec.timers] : [],
    modifiers: new Map(),
    script: spec.script ? { ...spec.script } : {},
    base,
    fielded,
    downed: false,
    deployEpoch: 0,
  }
}

// MARK: world

/** 一场战斗的世界，核心记录是 UnitState。 */
export type BattleWorld = World<UnitState>

/** 本场的世界与注册表。内置模块从内容上下文按这个资源取到它们。 */
export interface Engine {
  readonly world: BattleWorld
  readonly registry: BattleRegistry
}

export const ENGINE = defineResource<Engine>("core:engine", () => {
  throw new Error("engine is set when the battle is created")
})

export function engineOf(ctx: ContentContext): Engine {
  return ctx.resource(ENGINE).ensure()
}

export function requireUnit(world: BattleWorld, unitId: string): UnitState {
  return requireEntity(world, unitId)
}

/** 放入一个单位并授予规格里的标签。 */
export function placeUnit(world: BattleWorld, registry: BattleRegistry, spec: UnitSpec, fielded: boolean): UnitState {
  checkSpecTags(registry, spec)
  const unit = addUnit(world, spec, fielded)
  grantSpecTags(registry, unit, spec)
  return unit
}

/** 放入一个单位，按规格建好路线、阻挡、攻击档案、索敌、限伤与免疫组件。规格的标签另由 grantSpecTags 授予。 */
export function addUnit(world: BattleWorld, spec: UnitSpec, fielded: boolean): UnitState {
  if (world.units.has(spec.id)) throw new Error(`单位重复: ${spec.id}`)
  const unit = createUnit(spec, fielded, world.units.size + 1)
  const components = world.components
  const route = compileRoute(spec.route ?? null, gridOf(world).rect)
  if (route) components.access(ROUTE).set(spec.id, { run: route, hidden: false })
  if (spec.blocking?.length || spec.blockedBy) {
    components.access(BLOCK).set(spec.id, { blocking: [...(spec.blocking ?? [])], blockedBy: spec.blockedBy ?? null })
  }
  const profile = profileFromSpec(spec)
  if (profile) components.access(ATTACK_PROFILE).set(spec.id, profile)
  if (spec.targetPriority) components.access(TARGET_PRIORITY).set(spec.id, spec.targetPriority)
  if (spec.hitLimit === true) components.access(HIT_LIMIT).set(spec.id, true)
  if (spec.immunity?.length) components.access(IMMUNITY).set(spec.id, new Set(spec.immunity))
  world.units.set(spec.id, unit)
  return unit
}

/** 单位上场：部署世代加一。 */
export function markDeployed(unit: UnitState): void {
  unit.deployEpoch += 1
}

// MARK: tag

/** 规格静态标签的来源。 */
export const SPEC_SOURCE = "spec"

/** 规格里的标签和技能标签都要已注册。未注册时报出标签与单位规格。 */
export function checkSpecTags(registry: BattleRegistry, spec: UnitSpec): void {
  for (const tag of spec.tags) registry.requireTag(tag, `unit spec ${spec.id}`)
  for (const skill of spec.skills) {
    for (const tag of skill.flags ?? []) registry.requireTag(tag, `unit spec ${spec.id}, skill ${skill.id}`)
  }
}

export function grantSpecTags(registry: BattleRegistry, unit: UnitState, spec: UnitSpec): void {
  for (const tag of spec.tags) grantTag(unit, registry.requireTag(tag, `unit spec ${spec.id}`), SPEC_SOURCE)
}

interface TagIds {
  readonly version: number
  readonly sorted: readonly string[]
}

const tagIdCache = new WeakMap<TagGrants, TagIds>()

/** 持有列表没变时返回上次排好的 id。 */
function tagIdsOf(unit: UnitState): TagIds {
  const cached = tagIdCache.get(unit.tags)
  if (cached && cached.version === unit.tags.version) return cached
  const ids: TagIds = {
    version: unit.tags.version,
    sorted: Object.freeze(heldTagIds(unit, () => true).sort()),
  }
  tagIdCache.set(unit.tags, ids)
  return ids
}

/** 单位持有的全部标签 id，不分来源，按 id 排序。 */
export function sortedTagIds(unit: UnitState): readonly string[] {
  return tagIdsOf(unit).sorted
}
