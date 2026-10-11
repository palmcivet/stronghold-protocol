import type { PhaseSlot } from "#contract/phase.js"
import type { AttackShape, TileCoord } from "#contract/spec.js"
import type { TimerDefinition as EntityTimer } from "#kernel/timer/index.js"
import type { TagKey } from "#kernel/world/tag.js"
import type { ContentContext } from "#port/context.js"

export const MODIFIER_OPS = ["add", "percent", "mul"] as const

export type ModifierOp = (typeof MODIFIER_OPS)[number]

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
  /** 状态在身上时授予的标签，来源记为这个状态。 */
  readonly tags: readonly TagKey[]
  readonly modifiers: readonly AttributeModifier[]
  /** 身上已有这些状态时，挡住别的状态。名单用免疫名，例如冻结是 frozen。 */
  // TRACE: source/immunity-names
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
  /** 这一击来自攻击计时，而不是技能或流失。 */
  attack?: boolean
}

/** 这一次伤害结算的方式。 */
export interface DamagePass {
  /** 减伤预览。算出护盾后的数字，不掷闪避，不写生命，不扣护盾，不填槽，不发事件。 */
  readonly preview: boolean
}

export interface DamageStepDefinition {
  readonly id: string
  /** 同一条伤害里的顺序。数字小的先执行，相同数字按注册先后。 */
  readonly priority: number
  apply(info: DamageInfo, ctx: ContentContext, pass: DamagePass): void
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

/** 一次选择器查询。 */
export interface SelectorQuery {
  /** 以谁为攻击者。按范围查询时是查询的单位，直接筛选一份名单时是 null。 */
  readonly origin: string | null
}

export interface SelectorDefinition {
  readonly id: string
  /** 筛选只缩小名单，排序只改顺序。缺省时两条都走。 */
  readonly kind?: "filter" | "sort"
  filter(unitId: string, ctx: ContentContext, query: SelectorQuery): boolean
  compare(left: string, right: string, ctx: ContentContext, query: SelectorQuery): number
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

export type TimerDefinition = EntityTimer<ContentContext>

/** 推、拉、恐惧、诱导的输入。用到的字段由这个动作自己读。 */
export interface ShiftInput {
  readonly force?: number
  readonly fromX?: number
  readonly fromY?: number
  readonly dirX?: number
  readonly dirY?: number
  readonly toX?: number
  readonly toY?: number
  readonly centerX?: number
  readonly centerY?: number
  readonly sourceX?: number
  readonly sourceY?: number
  readonly effect?: boolean
  readonly fixed?: boolean
  readonly inward?: boolean
  /** 立即完成的位移在画面上是否保持原朝向。缺省 true。 */
  readonly keepFacing?: boolean
}

export interface ShiftPlan {
  readonly x: number
  readonly y: number
  readonly points?: readonly TileCoord[]
}

export interface ShiftDefinition {
  readonly id: string
  /** 为真时这一拍就写到落点。为假时沿 points 走，倒地先落到 x、y。 */
  readonly instant: boolean
  plan(unitId: string, input: ShiftInput, ctx: ContentContext): ShiftPlan | null
}

export interface DeployStrategyDefinition {
  readonly id: string
  opening(ctx: ContentContext): readonly string[]
  downedTile(unitId: string, ctx: ContentContext): TileCoord
  canStand(unitId: string, tile: TileCoord, ctx: ContentContext): boolean
}

/** 系统执行顺序里的一项。 */
export interface SystemOrderEntry {
  readonly slot: PhaseSlot
  readonly id: string
}

export interface PhaseSystem {
  readonly id: string
  readonly slot: PhaseSlot
  /** 同一阶段槽里的顺序。数字小的先执行，相同数字按注册先后。 */
  readonly priority: number
  /** 排在这些同槽系统之前。在 priority 与注册先后之上再满足。 */
  readonly before?: readonly string[]
  /** 排在这些同槽系统之后。 */
  readonly after?: readonly string[]
  run(ctx: ContentContext): void
}

/** 到达后按攻击形状结算。没有这份数据时，到达只造成 amount 的 physical 伤害。 */
export interface ProjectileImpact {
  readonly shape: AttackShape
  readonly hitCount: number
  /** 飞出的一发。回到投掷者时是 back。 */
  readonly leg?: "out" | "back"
  /** 飞回的速度。有这个数时，飞出到达后朝来源再飞一发，回程不结算伤害。 */
  readonly returnSpeed?: number
}

export interface ProjectileLaunch {
  readonly id: string
  readonly sourceId: string
  readonly targetId: string
  readonly amount: number
  /** 格/秒。缺省用 PROJECTILE_SPEED。 */
  readonly speed?: number
  /** 出发坐标。缺省用来源单位的当前位置。 */
  readonly x?: number
  readonly y?: number
  /** 目标离场后仍飞向最后看到的坐标并结算。 */
  readonly retain?: boolean
  readonly attack?: ProjectileImpact
}

/** 仍在飞的一发。到达或目标中途离场后不再出现。 */
export interface ProjectileView {
  readonly id: string
  readonly sourceId: string
  readonly targetId: string
  readonly amount: number
  readonly speed: number
  readonly x: number
  readonly y: number
}

/** 本场注册的全部定义。内容经 Registration 写入，引擎按 id 读取。 */
export interface BattleRegistry {
  registerStatus(definition: StatusDefinition): void
  requireStatus(id: string): StatusDefinition
  registerDamageStep(definition: DamageStepDefinition): void
  damageSteps(): readonly DamageStepDefinition[]
  registerElement(definition: ElementDefinition): void
  requireElement(id: string): ElementDefinition
  registerSelector(definition: SelectorDefinition): void
  requireSelector(id: string): SelectorDefinition
  registerSkillTrigger(definition: SkillTriggerDefinition): void
  requireSkillTrigger(id: string): SkillTriggerDefinition
  hasSkillTrigger(id: string): boolean
  registerSkillBody(definition: SkillBodyDefinition): void
  requireSkillBody(id: string): SkillBodyDefinition
  hasSkillBody(id: string): boolean
  registerTimer(definition: TimerDefinition): void
  requireTimer(id: string): TimerDefinition
  timersInSlot(slot: PhaseSlot): readonly TimerDefinition[]
  registerDeployStrategy(definition: DeployStrategyDefinition): void
  requireDeployStrategy(id: string): DeployStrategyDefinition
  registerShift(definition: ShiftDefinition): void
  requireShift(id: string): ShiftDefinition
  registerSystem(system: PhaseSystem): void
  systemsIn(slot: PhaseSlot): readonly PhaseSystem[]
  /** 全部系统的执行顺序：按阶段槽，再按槽内顺序。 */
  systemOrder(): readonly SystemOrderEntry[]
  registerTag(key: TagKey): void
  /** owner 写进未注册的报错，例如单位规格。 */
  requireTag(id: string, owner?: string): TagKey
}
