import type { UnitSide } from "#contract/spec.js"

// MARK: payload

/** 普攻出手前。订阅者把 cancel 改成 true 时这一下不打出去。 */
export type AttackEvent = {
  readonly unitId: string
  readonly targetIds: readonly string[]
  cancel: boolean
}

/** 一次伤害进入减伤之前。订阅者可以改数额、倍率、类型或取消。 */
export type HitEvent = {
  readonly sourceId: string
  /** 记功的单位。sourceless 时 sourceId 是空串，creditId 仍是出手者。 */
  readonly creditId: string
  readonly targetId: string
  amount: number
  kind: string
  mul?: number
  cancel: boolean
  readonly sourceless: boolean
  readonly element?: string
}

/** 元素损伤进槽之前。字段与 hit 相同，mul 总是有值。 */
export type ElementHitEvent = HitEvent & { mul: number }

/** 生命降到 0。订阅者把 prevented 改成 true 时留 1 点生命。 */
export type FatalEvent = {
  readonly sourceId: string
  readonly creditId: string
  readonly targetId: string
  readonly amount: number
  readonly kind: string
  prevented: boolean
  readonly sourceless: boolean
}

export type DamagedEvent = {
  readonly sourceId: string
  readonly creditId: string
  readonly targetId: string
  readonly amount: number
  /** 实际扣掉的生命：结算前的生命减去结算后的生命，不含溢出。 */
  readonly applied: number
  readonly kind: string
  /** 结算之后的生命。 */
  readonly hp: number
  readonly sourceless: boolean
  readonly attack?: true
}

/** 流失：不经伤害步骤的扣血。 */
export type LossEvent = {
  readonly unitId: string
  readonly amount: number
  readonly hp: number
}

export type HealEvent = {
  readonly unitId: string
  /** 没有来源时是空串。 */
  readonly sourceId: string
  /** 实际加上的生命。 */
  readonly amount: number
  readonly hp: number
}

export type UnitEvent = {
  readonly unitId: string
}

/** 倒下。有部署策略时带上倒下的格子与能否站在那里。 */
export type DownedEvent = {
  readonly unitId: string
  readonly x?: number
  readonly y?: number
  readonly canStand?: boolean
}

/** 被移到 x、y。duration 是位移时长（秒），keepFacing 为真时画面保持原朝向。 */
export type DisplaceEvent = {
  readonly unitId: string
  readonly x: number
  readonly y: number
  readonly duration: number
  readonly keepFacing: boolean
}

export type BlockEvent = {
  readonly blockerId: string
  readonly enemyId: string
}

export type CostEvent = {
  readonly side: UnitSide
  readonly value: number
}

export type ProjectileEvent = {
  readonly id: string
  readonly sourceId: string
  readonly targetId: string
}

export type SkillEvent = {
  readonly unitId: string
  readonly skillId: string
  readonly reason: string
}

export type AmmoUsedEvent = {
  readonly unitId: string
  readonly skillId: string
  readonly left: number
}

export type StatusEvent = {
  readonly unitId: string
  readonly statusId: string
  readonly stacks: number
}

export type ElementBurstEvent = {
  readonly sourceId: string
  readonly targetId: string
  readonly element: string
}

// MARK: cue

/** 画面线索的种类到附带数据。内容与模组经声明合并加入自己的种类。 */
export interface CueMap {}

/** 画面线索。只给画面与音效，不影响结算。 */
export type CueEvent = {
  [K in keyof CueMap & string]: {
    readonly kind: K
    readonly unitId?: string
    readonly x?: number
    readonly y?: number
  } & CueMap[K]
}[keyof CueMap & string]

// MARK: map

/** 把事件标成可拦截：订阅者同步、按订阅顺序拿到可写的数据，发出者在分发后读回。 */
export interface Intercept<T> {
  readonly intercept: T
}

/**
 * 事件名到事件数据。写成 Intercept<数据> 的事件可拦截，其余只读、排队分发。模块经声明合并加入自己的事件：
 *
 * ```ts
 * declare module "arknights-mission-core" {
 *   interface BattleEventMap {
 *     "doll-swap": { readonly unitId: string }
 *     "doll-guard": Intercept<{ readonly unitId: string; cancel: boolean }>
 *   }
 * }
 * ```
 */
export interface BattleEventMap {
  attack: Intercept<AttackEvent>
  "attack-hit": UnitEvent
  hit: Intercept<HitEvent>
  "element-hit": Intercept<ElementHitEvent>
  fatal: Intercept<FatalEvent>
  damaged: DamagedEvent
  loss: LossEvent
  heal: HealEvent
  downed: DownedEvent
  /** 离场且不再回来：召唤物消失、装置被摧毁、敌人漏出或被移除。从下一次快照起不再出现。 */
  removed: UnitEvent
  deploy: UnitEvent
  spawn: UnitEvent
  displace: DisplaceEvent
  blocked: BlockEvent
  unblocked: BlockEvent
  cost: CostEvent
  leak: UnitEvent
  projectile: ProjectileEvent
  "skill-start": SkillEvent
  "skill-end": SkillEvent
  "ammo-used": AmmoUsedEvent
  status: StatusEvent
  "element-burst": ElementBurstEvent
  cue: CueEvent
}

export type BattleEventType = keyof BattleEventMap & string

/** 可拦截的事件名。 */
export type InterceptEventType = {
  [K in BattleEventType]: BattleEventMap[K] extends Intercept<unknown> ? K : never
}[BattleEventType]

/** 只读、排队分发的事件名。 */
export type NoticeEventType = Exclude<BattleEventType, InterceptEventType>

/** 事件数据：可拦截的事件是可写的数据，其余是只读的数据。还没有声明任何种类的 cue 是 never。 */
export type EventData<K extends BattleEventType> = [BattleEventMap[K]] extends [never]
  ? never
  : BattleEventMap[K] extends Intercept<infer T>
    ? T
    : Readonly<BattleEventMap[K]>

/** 一条事件。不写 K 时是全部事件的联合，按 type 收窄。 */
export type BattleEvent<K extends BattleEventType = BattleEventType> = {
  [P in K]: {
    readonly tick: number
    readonly type: P
    readonly data: EventData<P>
  }
}[K]
