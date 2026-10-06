import type { PhaseSlot } from "#contract/phase.js"
import type { BattleEvent } from "#contract/event.js"
import type { TileCoord, TileSpec, UnitSide, UnitSpec } from "#contract/spec.js"
import type { Random } from "#random/index.js"

export const modifierOps = ["add", "percent", "mul"] as const

export type ModifierOp = (typeof modifierOps)[number]

export interface AttributeModifier {
  readonly attribute: string
  readonly op: ModifierOp
  readonly value: number
}

/** 一次施加。缺省的持续时间用状态自己的时长。 */
export interface StatusApplication {
  /** 秒。缺省用状态定义上的时长。Infinity 表示一直持续。0 或负数这次施加不成立。 */
  readonly duration?: number
  /** 这次的强度。缺省用状态定义上的默认强度。 */
  readonly value?: number
}

/** 叠法看到的这一次施加，时长已经换成状态计时器的拍数。 */
export interface StatusIncoming {
  readonly ticks: number
  readonly permanent: boolean
  readonly value: number
  /** 施加时的战场拍数。 */
  readonly at: number
}

/** 同名状态叠在一起时，叠法读写的那一条。 */
export interface StatusRecord {
  id: string
  stacks: number
  remaining: number
  permanent: boolean
  shield: number
  shieldHits: number
  runtimeModifiers: AttributeModifier[]
  pulse: number
  carried: boolean
  priorRemaining: number
  strength: number
  dropped: boolean
  /** 弱的一次等强的结束再续上。until 是战场拍数。 */
  tail: { value: number; until: number } | null
}

export interface StatusDefinition {
  readonly id: string
  readonly flags: readonly string[]
  readonly modifiers: readonly AttributeModifier[]
  /** 身上已有这些状态时，挡住别的状态。名单用 master 的免疫名，例如冻结是 frozen。 */
  readonly immunity: readonly string[]
  /**
   * 这个状态自己被挡住时，单位免疫名单里对应的名字。
   * 与状态 id 可以不同，冻结的 id 是 freeze，免疫名是 frozen。
   */
  readonly immune?: string
  readonly stackCap: number
  readonly cancels: readonly string[]
  /** 0 表示一直持续，直到被取下。正数是状态计时器推进的次数。 */
  readonly duration: number
  /** 缺省强度。慢速、脆弱这类同名取最高的状态用它。 */
  readonly valued?: number
  /** 按这次的强度写出修饰。和 modifiers 同时存在时两边都会汇总。 */
  scale?(value: number): readonly AttributeModifier[]
  /**
   * 同名再施加时怎么叠。缺省是刷新时长并叠层。
   * 返回 undefined 表示这次不生效。
   */
  overlap?(
    statuses: StatusRecord[],
    existing: StatusRecord | undefined,
    incoming: StatusIncoming,
    definition: StatusDefinition,
  ): StatusRecord | undefined
  onApply?(unitId: string, stacks: number, ctx: ContentContext): void
  onTick?(unitId: string, stacks: number, ctx: ContentContext): void
}

export interface DamageInfo {
  sourceId: string
  targetId: string
  amount: number
  kind: string
  /** 这一击自带的乘数。缺省为 1。 */
  mul?: number
  defIgnorePct?: number
  defIgnoreFlat?: number
  resIgnorePct?: number
  resIgnoreFlat?: number
  /** 元素标识。kind 为 element 时写入这个槽。 */
  element?: string
  /** 缺省时物理和法术可以闪避，真实和元素不行。 */
  canDodge?: boolean
  /** 无来源。不用来源的伤害乘算和穿透，击杀仍记在 sourceId。起飞挡不住它。 */
  sourceless?: boolean
  /** 沉睡挡不住这一击。 */
  ignoreSleep?: boolean
  /** 起飞的对地规避挡不住这一击。 */
  ignoreSelect?: boolean
  /** 为 true 后，后面的步骤不再写生命。 */
  cancel?: boolean
}

export interface HealOptions {
  readonly sourceId?: string
  /** 治疗来自目标自己，禁疗不拦住它。 */
  readonly self?: boolean
  /** 超出最大生命的部分变成护盾，这份护盾不超过最大生命。 */
  readonly overheal?: boolean
  /** 生命回复，不受禁疗影响。 */
  readonly regen?: boolean
  /** 这次治疗无视禁疗。 */
  readonly ignoreHealFree?: boolean
}

export interface DamageStepDefinition {
  readonly id: string
  /** 同一条伤害里的顺序。数字小的先执行，相同数字按注册先后。 */
  readonly priority: number
  apply(info: DamageInfo, ctx: ContentContext): void
}

export interface DamagePreview {
  readonly sourceId: string
  readonly targetId: string
  readonly amount: number
  readonly kind: string
  readonly steps: readonly string[]
}

export interface ElementDefinition {
  readonly id: string
  readonly cap: number
  readonly resistance: number
  onBurst?(unitId: string, ctx: ContentContext, sourceId?: string): void
}

export interface SelectorDefinition {
  readonly id: string
  /** 筛选只缩小名单，排序只改顺序。缺省时两条都走。 */
  readonly kind?: "filter" | "sort"
  filter(unitId: string, ctx: ContentContext): boolean
  compare(left: string, right: string, ctx: ContentContext): number
}

export interface SkillTriggerDefinition {
  readonly id: string
  shouldCast(unitId: string, skillId: string, ctx: ContentContext): boolean
}

export interface SkillRuntime {
  active: boolean
  remaining: number
  ammo: number
  toggled: boolean
}

export interface SkillBodyDefinition {
  readonly id: string
  cast(skill: SkillRuntime, spec: { readonly duration: number; readonly ammo: number }): void
  advance(skill: SkillRuntime, ctx: ContentContext): void
  /** 释放、结束、每拍、命中。和单位技能规格上的回调一起被调用。 */
  onCast?(unitId: string, skillId: string, ctx: ContentContext): void
  onEnd?(unitId: string, skillId: string, ctx: ContentContext): void
  onTick?(unitId: string, skillId: string, ctx: ContentContext): void
  onHit?(unitId: string, skillId: string, ctx: ContentContext): void
}

export type TimerState = Record<string, string | number | boolean>

export type TimerView = Readonly<Record<string, string | number | boolean>>

export interface TimerDefinition {
  readonly id: string
  readonly slot: PhaseSlot
  create(): TimerState
  advance(state: TimerState, unitId: string, ctx: ContentContext): void
  cancel(state: TimerState): void
  view(state: TimerState): TimerView
}

export interface DeployStrategyDefinition {
  readonly id: string
  opening(ctx: ContentContext): readonly string[]
  downedTile(unitId: string, ctx: ContentContext): TileCoord
  canStand(unitId: string, tile: TileCoord, ctx: ContentContext): boolean
}

export interface PhaseSystem {
  readonly id: string
  readonly slot: PhaseSlot
  /** 同一阶段槽里的顺序。数字小的先执行，相同数字按注册先后。 */
  readonly priority: number
  run(ctx: ContentContext): void
}

export interface ProjectileLaunch {
  readonly id: string
  readonly sourceId: string
  readonly targetId: string
  readonly amount: number
}

/**
 * 命中外形。`tile` 是点单位所站的一格，`rect` 是大体型矩形。
 * x、y 是外形左下角。距离用站位或矩形边计算，不从这块外形反推。
 * 以后的外形在这里再加一种 kind。
 */
export type HitShape =
  | { readonly kind: "tile"; readonly x: number; readonly y: number; readonly w: 1; readonly h: 1 }
  | { readonly kind: "rect"; readonly x: number; readonly y: number; readonly w: number; readonly h: number }

/** install 只能注册和订阅。 */
export interface Registration {
  registerStatus(definition: StatusDefinition): void
  registerDamageStep(definition: DamageStepDefinition): void
  registerElement(definition: ElementDefinition): void
  registerSelector(definition: SelectorDefinition): void
  registerSkillTrigger(definition: SkillTriggerDefinition): void
  registerSkillBody(definition: SkillBodyDefinition): void
  registerTimer(definition: TimerDefinition): void
  registerDeployStrategy(definition: DeployStrategyDefinition): void
  registerSystem(system: PhaseSystem): void
  subscribe(type: string, handler: (event: BattleEvent) => void): () => void
}

export interface MissionModule {
  readonly id: string
  readonly dependsOn?: readonly string[]
  install(ctx: Registration): void
}

export interface ContentContext extends Registration {
  dealDamage(info: DamageInfo): void
  heal(unitId: string, amount: number, options?: HealOptions): void
  /** 不减防御和法抗，不发 damaged。hitLimit 打开且 ceil(数额) 达到首领限伤时不扣生命。 */
  loseHp(unitId: string, amount: number): void
  applyStatus(unitId: string, statusId: string, application?: StatusApplication): void
  spawnUnit(spec: UnitSpec): void
  displace(unitId: string, x: number, y: number): void
  launchProjectile(projectile: ProjectileLaunch): void
  emit(type: string, data: Readonly<Record<string, unknown>>): void
  readonly random: Random
  hitRect(unitId: string): HitShape
  unitsInRange(unitId: string, selectorId: string | readonly string[]): readonly string[]
  select(selectorId: string | readonly string[], unitIds: readonly string[]): readonly string[]
  previewDamage(info: DamageInfo): DamagePreview
  startTimer(unitId: string, timerId: string): void
  advanceTimer(unitId: string, timerId: string): void
  advanceStartedTimers(slot: PhaseSlot): void
  timerView(unitId: string, timerId: string): TimerView
  addElement(unitId: string, elementId: string, amount: number): void
  moduleData(moduleId: string, unitId: string): Record<string, unknown>
  schedule(tick: number, run: (ctx: ContentContext) => void): void
  finish(winner: UnitSide): void
  tick(): number
  shouldCast(unitId: string, skillId: string): boolean
  castSkill(unitId: string, skillId: string): void
  /** 外界给予技力。阻回和持续技能期间不加。返回实际加上的数量。 */
  gainSp(unitId: string, skillId: string, amount: number): number
  tile(x: number, y: number): TileSpec | null
  projectiles(): readonly ProjectileLaunch[]
}
