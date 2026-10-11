import type { PhaseSlot } from "#contract/phase.js"
import type { BattleEvent, EventData, InterceptEventType, NoticeEventType } from "#contract/event.js"
import type { Direction, Motion, TileSpec, UnitSide, UnitSpec } from "#contract/spec.js"
import type { Random } from "#kernel/random/index.js"
import type { TimerView } from "#kernel/timer/index.js"
import type { ComponentAccess, ComponentKey } from "#kernel/world/component.js"
import type { ResourceAccess, ResourceKey } from "#kernel/world/resource.js"
import type { TagKey } from "#kernel/world/tag.js"
import type { Registration } from "#port/module.js"
import type {
  AttributeModifier,
  DamageInfo,
  DamagePreview,
  ProjectileLaunch,
  ProjectileView,
  ShiftInput,
  StatusApplication,
} from "#port/definition.js"

export interface HealOptions {
  readonly sourceId?: string
  /** 治疗来自目标自己，禁疗不拦住它。 */
  readonly self?: boolean
  /** 超出最大生命的部分变成护盾，这份护盾不超过最大生命。 */
  readonly overheal?: boolean
  /** 溢出护盾的秒数。缺省一直留着，到点后这份护盾去掉。 */
  readonly overhealDuration?: number
  /** 生命回复，不受禁疗影响。 */
  readonly regen?: boolean
  /** 这次治疗无视禁疗。 */
  readonly ignoreHealFree?: boolean
}

/**
 * 命中外形。`tile` 是点单位所站的一格，`rect` 是大体型矩形。
 * x、y 是外形左下角。距离用站位或矩形边计算，不从这块外形反推。
 * 以后的外形在这里再加一种 kind。
 */
export type HitShape =
  | { readonly kind: "tile"; readonly x: number; readonly y: number; readonly w: 1; readonly h: 1 }
  | { readonly kind: "rect"; readonly x: number; readonly y: number; readonly w: number; readonly h: number }

/** 单位在内容脚本里能读到的样子。 */
/** 单位的只读视图。标签不在视图里，用 `hasTag` 按键查，需要分来源时用 `tagSources`。 */
export interface UnitView {
  readonly id: string
  readonly side: UnitSide
  readonly x: number
  readonly y: number
  readonly hp: number
  readonly maxHp: number
  /** 在场、未倒下、生命大于 0、路线未隐藏。 */
  readonly alive: boolean
  readonly fielded: boolean
  readonly downed: boolean
  readonly facing: Direction
  readonly motion: Motion
}

/** 订阅者改一笔正在结算的事件。伤害管线在发出之后读这些字段。 */
export interface EventRevision {
  readonly prevented?: boolean
  readonly cancel?: boolean
  readonly amount?: number
  readonly mul?: number
  readonly kind?: string
}

export interface ContentContext extends Registration {
  dealDamage(info: DamageInfo): void
  heal(unitId: string, amount: number, options?: HealOptions): void
  /** 不减防御和法抗，不发 damaged。hitLimit 打开且 ceil(数额) 达到首领限伤时不扣生命。 */
  loseHp(unitId: string, amount: number): void
  applyStatus(unitId: string, statusId: string, application?: StatusApplication): void
  /** 放入一个单位并发 spawn。kind 为 device 时就是装置。部署策略不让它站在那一格时不放。 */
  spawnUnit(spec: UnitSpec): void
  /** 单位离场且不再回来：放开阻挡，发 removed，从下一次快照起不再出现。记录留到战斗结束。 */
  removeUnit(unitId: string): void
  displace(unitId: string, x: number, y: number): void
  /** 推、拉、恐惧或诱导。未知标识拒绝。移不动时返回 false。 */
  shift(actionId: string, unitId: string, input?: ShiftInput): boolean
  /** 在格子上摆上或拿掉障碍。kind 缺省是挡住地面寻路的 block，crate 是箱子。 */
  setObstacle(x: number, y: number, on: boolean, kind?: "block" | "crate"): void
  launchProjectile(projectile: ProjectileLaunch): void
  /** 当前费用。不够时不扣，返回 false。 */
  spendCost(side: UnitSide, amount: number): boolean
  /** 加上费用，结果不超过该阵营的上限。 */
  addCost(side: UnitSide, amount: number): void
  costOf(side: UnitSide): number
  /** 发只读事件。订阅者里发出时等当前事件分发完再分发。 */
  emit<K extends NoticeEventType>(type: K, data: EventData<K>): void
  /** 发可拦截的事件：订阅者立即同步改写 data，返回后读回。 */
  intercept<K extends InterceptEventType>(type: K, data: EventData<K>): void
  readonly random: Random
  hitRect(unitId: string): HitShape
  unitsInRange(unitId: string, selectorId: string | readonly string[]): readonly string[]
  /** 直接筛选一份名单，没有攻击者。 */
  select(selectorId: string | readonly string[], unitIds: readonly string[]): readonly string[]
  previewDamage(info: DamageInfo): DamagePreview
  startTimer(unitId: string, timerId: string): void
  advanceTimer(unitId: string, timerId: string): void
  advanceStartedTimers(slot: PhaseSlot): void
  timerView(unitId: string, timerId: string): TimerView
  addElement(unitId: string, elementId: string, amount: number): void
  /** 按单位存的一张组件表。 */
  component<T>(key: ComponentKey<T>): ComponentAccess<T>
  /** 本场唯一的一份数据。 */
  resource<T>(key: ResourceKey<T>): ResourceAccess<T>
  /** 持有这个标签，或持有的标签蕴含它。没有这个单位时返回 false。 */
  hasTag(unitId: string, key: TagKey): boolean
  /** 按来源授予标签。同一来源授予几次就要撤销几次。 */
  grantTag(unitId: string, key: TagKey, sourceId: string): void
  revokeTag(unitId: string, key: TagKey, sourceId: string): void
  /** 持有这个标签的来源。 */
  tagSources(unitId: string, key: TagKey): readonly string[]
  schedule(tick: number, run: (ctx: ContentContext) => void): void
  finish(winner: UnitSide): void
  tick(): number
  shouldCast(unitId: string, skillId: string): boolean
  /** 释放技能。成功返回 true。充能不够或正在持续时返回 false。 */
  castSkill(unitId: string, skillId: string): boolean
  /** 把这一技能的充能补满，使下一次 castSkill 能够释放。 */
  readySkill(unitId: string, skillId: string): void
  /** 按内容脚本改技能体、弹药和持续时间。技能不存在时不做。 */
  configureSkill(unitId: string, skillId: string, spec: { body?: string; ammo?: number; duration?: number }): void
  /** 攻击选目标时的优先规则。空字符串恢复默认。 */
  setAim(unitId: string, priority: string): void
  /** 外界给予技力。阻回和持续技能期间不加。返回实际加上的数量。 */
  gainSp(unitId: string, skillId: string, amount: number): number
  tile(x: number, y: number): TileSpec | null
  projectiles(): readonly ProjectileView[]
  /** 没有这个单位时返回 null。 */
  unit(unitId: string): UnitView | null
  /** 缺省时两边的单位都在名单里，顺序是入场顺序。 */
  units(side?: UnitSide): readonly string[]
  /** 算上状态和具名修饰。没有这个单位时返回 0。maxHp 用最大生命，hp 用当前生命。 */
  attribute(unitId: string, key: string): number
  /**
   * 按 key 写上一组属性修饰，同 key 再写会换掉上一组。
   * duration 是秒。缺省一直留着。0 或负数等于清掉这个 key。
   */
  setModifier(unitId: string, key: string, modifiers: readonly AttributeModifier[], duration?: number): void
  clearModifier(unitId: string, key: string): void
  hasModifier(unitId: string, key: string): boolean
  /** 单位黑板。没有这个单位、或黑板上没有值时返回空记录。 */
  script(unitId: string): Readonly<Record<string, string | number | boolean>>
  /** 这场战斗的 notes。规格没写时是空记录。 */
  field(): Readonly<Record<string, unknown>>
  /** 把 revision 里有的字段写进这次事件。伤害和致命结算会读到。 */
  revise(event: BattleEvent, revision: EventRevision): void
}
