import type { AttackClip, AttackShape, Direction, HitArea, Motion, SkillHook, SkillModifier, UnitKind, UnitSpec } from "#contract/spec.js"
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
import { compileRoute, type RouteRun } from "#field/grid/route.js"
import { gridOf } from "#field/grid/index.js"

/** 一段还在走的位移。落点在 landing，路径在 points。 */
export interface ShiftRun {
  readonly id: string
  landingX: number
  landingY: number
  readonly points: { x: number; y: number }[]
  index: number
}

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

export interface ElementSlot {
  value: number
  locked: boolean
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
  /** 免疫名单。冻结写成 frozen，恐惧和战栗写成 feared，其余与状态 id 相同。 */
  // TRACE: source/immunity-names
  readonly immunity: ReadonlySet<string>
  readonly attackClip: AttackClip | null
  readonly attackShape: AttackShape | null
  /** 已经飞出、还没回到手上的回旋物。计时器读这个数，攻击形状不因此停手。 */
  boomerangsOut: number
  /** 再部署清零回旋时加一。回程的世代对不上这个数时不改计数。 */
  boomerangEpoch: number
  /** 还没走完的推、拉、恐惧或诱导。倒地时先写到落点。 */
  shiftRun: ShiftRun | null
  readonly targetPriority: string
  readonly blocking: string[]
  blockedBy: string | null
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
  route: RouteRun | null
  /** 路线消失。快照把它写成 hidden。 */
  routeHidden: boolean
  readonly statuses: StatusInstance[]
  readonly elements: Map<string, ElementSlot>
  readonly timers: Map<string, TimerState>
  /** 规格列出的独立计时器 id。 */
  readonly listedTimers: readonly string[]
  /** 按 key 挂上的属性修饰。remaining 是还没走到的终局拍数，Infinity 一直留着。 */
  readonly modifiers: Map<string, { modifiers: readonly AttributeModifier[]; remaining: number }>
  readonly script: Readonly<Record<string, string | number | boolean>>
  readonly base: Record<string, number>
  hitLimit: boolean
  /** 溢出治疗转成的护盾，上限是最大生命。 */
  overhealShield: number
  /** 正在结算的元素爆发。这段时间任何元素都不进槽。 */
  bursting: boolean
  /** 最近一次把元素槽打满的单位。爆发伤害的击杀记在它身上。 */
  elementCredit: string
  fielded: boolean
  downed: boolean
}

function copyAttackShape(shape: AttackShape): AttackShape {
  return {
    ...(shape.damage ? { damage: shape.damage } : {}),
    ...(shape.splash ? { splash: { ...shape.splash } } : {}),
    ...(shape.bounce ? { bounce: { ...shape.bounce } } : {}),
    ...(shape.chain ? { chain: { ...shape.chain } } : {}),
    ...(shape.healCount !== undefined ? { healCount: shape.healCount } : {}),
    ...(shape.lockRange === true ? { lockRange: true } : {}),
    ...(shape.projectile ? { projectile: shape.projectile } : {}),
  }
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
    immunity: new Set(spec.immunity ?? []),
    attackClip: spec.attackClip ? { duration: spec.attackClip.duration, hit: spec.attackClip.hit } : null,
    attackShape: spec.attackShape ? copyAttackShape(spec.attackShape) : null,
    boomerangsOut: 0,
    boomerangEpoch: 0,
    shiftRun: null,
    targetPriority: spec.targetPriority ?? "",
    blocking: [...(spec.blocking ?? [])],
    blockedBy: spec.blockedBy ?? null,
    aggroSeq: spec.aggroSeq ?? order,
    spawnSeq: order,
    homeX: Math.round(spec.x),
    homeY: Math.round(spec.y),
    x: spec.x,
    y: spec.y,
    facing: spec.facing ?? "RIGHT",
    hitArea: spec.hitArea ?? null,
    motion: spec.motion ?? "WALK",
    route: null,
    routeHidden: false,
    statuses: [],
    elements: new Map(),
    timers: new Map(),
    listedTimers: spec.timers ? [...spec.timers] : [],
    modifiers: new Map(),
    script: spec.script ? { ...spec.script } : {},
    base,
    hitLimit: spec.hitLimit === true,
    overhealShield: 0,
    bursting: false,
    elementCredit: "",
    fielded,
    downed: false,
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

/** 放入一个单位。规格的标签另由 grantSpecTags 授予。 */
export function addUnit(world: BattleWorld, spec: UnitSpec, fielded: boolean): UnitState {
  if (world.units.has(spec.id)) throw new Error(`单位重复: ${spec.id}`)
  const unit = createUnit(spec, fielded, world.units.size + 1)
  unit.route = compileRoute(spec.route ?? null, gridOf(world).rect)
  world.units.set(spec.id, unit)
  return unit
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

/** 规格写的标签 id，按规格顺序。 */
export function specTagIds(unit: UnitState): readonly string[] {
  return tagIdsOf(unit).spec
}

interface TagIds {
  readonly version: number
  readonly spec: readonly string[]
  readonly granted: readonly string[]
}

const tagIdCache = new WeakMap<TagGrants, TagIds>()

/** 持有列表没变时返回上次算好的两份 id。 */
function tagIdsOf(unit: UnitState): TagIds {
  const cached = tagIdCache.get(unit.tags)
  if (cached && cached.version === unit.tags.version) return cached
  const ids: TagIds = {
    version: unit.tags.version,
    spec: Object.freeze(heldTagIds(unit, fromSpec)),
    granted: Object.freeze(heldTagIds(unit, notFromSpec)),
  }
  tagIdCache.set(unit.tags, ids)
  return ids
}

function fromSpec(sourceId: string): boolean {
  return sourceId === SPEC_SOURCE
}

function notFromSpec(sourceId: string): boolean {
  return sourceId !== SPEC_SOURCE
}

/** 状态、技能与模块授予的标签 id，按第一次授予的顺序。 */
export function grantedTagIds(unit: UnitState): readonly string[] {
  return tagIdsOf(unit).granted
}
