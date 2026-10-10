import type { AttackClip, AttackShape, Direction, HitArea, Motion, SkillHook, SkillModifier, UnitKind, UnitSpec } from "#contract/spec.js"
import type { AttributeModifier, SkillRuntime, TimerState } from "#port/content.js"
import { copyModifiers } from "#ability/skill/modifier.js"
import {
  isSkillOperation,
  isSpType,
  normalizeTrigger,
  type SkillOperation,
  type SpType,
} from "#ability/skill/constants.js"
import type { RouteRun } from "#field/grid/route.js"

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
  return unit.flags.has("float") || unit.flags.has("levitate")
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
  readonly tags: readonly string[]
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
  /** 路线消失。状态重写 flags 时留在单位上。 */
  routeHidden: boolean
  readonly flags: Set<string>
  readonly statuses: StatusInstance[]
  readonly elements: Map<string, ElementSlot>
  readonly timers: Map<string, TimerState>
  /** 规格列出的独立计时器 id。 */
  readonly listedTimers: readonly string[]
  readonly moduleData: Map<string, Record<string, unknown>>
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
    tags: [...spec.tags],
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
    flags: new Set(),
    statuses: [],
    elements: new Map(),
    timers: new Map(),
    listedTimers: spec.timers ? [...spec.timers] : [],
    moduleData: new Map(),
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
