export const UNIT_SIDES = ["ally", "enemy"] as const

export type UnitSide = (typeof UNIT_SIDES)[number]

/** What a unit is in the battle: a deployed operator, an enemy, a summon, or a stage device (crate, turret). */
export const UNIT_KINDS = ["operator", "enemy", "token", "device"] as const

export type UnitKind = (typeof UNIT_KINDS)[number]

export const DIRECTIONS = ["UP", "RIGHT", "DOWN", "LEFT"] as const

export type Direction = (typeof DIRECTIONS)[number]

export const MOTIONS = ["WALK", "FLY"] as const

export type Motion = (typeof MOTIONS)[number]

export interface TileCoord {
  readonly x: number
  readonly y: number
}

/** 大体型受击矩形，单位是格。dx、dy 是相对站位中心的偏移。 */
export interface HitArea {
  readonly w: number
  readonly h: number
  readonly dx: number
  readonly dy: number
}

export type RouteCheckpoint =
  | { readonly type: "move"; readonly x: number; readonly y: number }
  | { readonly type: "wait"; readonly time: number }
  | { readonly type: "disappear" }
  | { readonly type: "appear"; readonly x: number; readonly y: number }

export interface RouteSpec {
  readonly checkpoints: readonly RouteCheckpoint[]
  readonly end?: TileCoord
}

export interface TileSpec {
  readonly x: number
  readonly y: number
  readonly height: number
  readonly deployable: boolean
  readonly walkableBy: readonly string[]
  /** 保护目标。恐惧选落点时跳过。 */
  readonly objective?: boolean
}

/** 调用方已经归一化的属性。生命写入使用 hp。 */
export type UnitAttributes = Readonly<Record<string, number>>

export const SP_TYPES = ["time", "attack", "hurt", "none"] as const

export type SpType = (typeof SP_TYPES)[number]

export const SKILL_OPERATIONS = ["MANUAL", "AUTO"] as const

export type SkillOperation = (typeof SKILL_OPERATIONS)[number]

export interface SkillModifier {
  readonly attribute: string
  readonly op: "add" | "percent" | "mul"
  readonly value: number
}

/** 技能体回调看到的这一拍。 */
export interface SkillMoment {
  readonly unitId: string
  readonly skillId: string
  readonly reason: string
  readonly dt: number
}

export type SkillHook = (moment: SkillMoment) => void

export interface SkillSpec {
  readonly id: string
  readonly body: string
  readonly trigger: string
  readonly spCost: number
  /** 秒。duration 技能的持续时间，弹药技能的可选时长上限。 */
  readonly duration: number
  readonly ammo: number
  /** 随时间、随攻击、随受击，或 none。缺省随时间。 */
  readonly spType?: SpType
  readonly initSp?: number
  /** 充能层数上限。缺省 1。 */
  readonly charges?: number
  /** MANUAL 受自动操作冷却约束。AUTO 不等。缺省 MANUAL。 */
  readonly operation?: SkillOperation
  /** 治疗技能：范围内看受伤友方。 */
  readonly heal?: boolean
  readonly mods?: readonly SkillModifier[]
  readonly flags?: readonly string[]
  /** 面向 RIGHT 的触发范围。SKILL_RANGE、CUSTOM_RANGE 和友方条件用它。 */
  readonly triggerRange?: readonly TileCoord[]
  /** 再要求触发范围内有一名生命比例不超过 triggerHpAtMost 的受伤友方。 */
  readonly triggerAllies?: boolean
  readonly triggerHpAtMost?: number
  readonly activateOnDeploy?: boolean
  readonly onStart?: SkillHook
  readonly onEnd?: SkillHook
  readonly onTick?: SkillHook
  readonly onHit?: SkillHook
}

/** 攻击片段。时长和命中点都是秒。 */
export interface AttackClip {
  readonly duration: number
  readonly hit: number
}

export const ATTACK_DAMAGE_KINDS = ["physical", "arts", "heal"] as const

export type AttackDamageKind = (typeof ATTACK_DAMAGE_KINDS)[number]

export const PROJECTILE_KINDS = ["arrow", "bolt", "orb", "bomb", "boomerang"] as const

export type ProjectileKind = (typeof PROJECTILE_KINDS)[number]

/** 命中点周围的一圈。半径用格，按站位中心量。 */
export interface SplashShape {
  readonly radius: number
  /** 圈内其他人受到的倍率。缺省 1。 */
  readonly scale?: number
  /**
   * 为真时主目标吃未乘倍率的一击，圈内其他人吃 scale。
   * 为假时圈内每个人，包括主目标，只吃 scale 这一下。
   */
  readonly othersOnly?: boolean
  readonly groundOnly?: boolean
}

/** 从主目标再跳到附近的敌方。count 含主目标。pause 是秒。 */
export interface BounceShape {
  readonly count: number
  readonly falloff: number
  readonly radius: number
  readonly pause: number
}

/** 从主目标再治疗附近的友方。count 含主目标。radius 缺省用 CHAIN_HEAL_RADIUS。 */
export interface ChainHealShape {
  readonly count: number
  readonly falloff: number
  readonly radius?: number
}

/** 一次攻击可以同时带上其中几项。没有这一项时，命中一个目标并立刻结算物理伤害。 */
export interface AttackShape {
  readonly damage?: AttackDamageKind
  readonly splash?: SplashShape
  readonly bounce?: BounceShape
  readonly chain?: ChainHealShape
  readonly healCount?: number
  readonly lockRange?: boolean
  readonly projectile?: ProjectileKind
}

export interface UnitSpec {
  readonly id: string
  readonly side: UnitSide
  /** 缺省时，友方是 operator，敌方是 enemy。 */
  readonly kind?: UnitKind
  readonly attributes: UnitAttributes
  readonly skills: readonly SkillSpec[]
  readonly attackRange: readonly TileCoord[]
  readonly tags: readonly string[]
  readonly deployPositions: readonly string[]
  readonly x: number
  readonly y: number
  readonly facing?: Direction
  readonly hitArea?: HitArea | null
  readonly motion?: Motion
  readonly route?: RouteSpec | null
  /** 缺省时前摇是 0，命中后停 0.35 秒。 */
  readonly attackClip?: AttackClip
  /** 溅射、弹射、治疗链、治疗人数、锁定范围、投射物。缺省是单体即时物理攻击。 */
  readonly attackShape?: AttackShape
  /** 特殊优先级的排序键。空着则这一项不改顺序。 */
  readonly targetPriority?: string
  /** 这个单位正在阻挡的单位。 */
  readonly blocking?: readonly string[]
  /** 挡住这个单位的单位。 */
  readonly blockedBy?: string | null
  /** 仇恨顺序。缺省按入场先后，越晚越大。 */
  readonly aggroSeq?: number
  /** 打开后，这一次结算达到首领限伤阈值就整段取消。 */
  readonly hitLimit?: boolean
  /**
   * 免疫名单。冻结是 frozen，恐惧和战栗是 feared，其余与状态 id 相同。
   */
  // TRACE: source/immunity-names
  readonly immunity?: readonly string[]
  /** 要启动的独立计时器 id。引擎对每一项调用 startTimer。 */
  readonly timers?: readonly string[]
  /** Content blackboard. Absent means the unit has no script values. */
  readonly script?: Readonly<Record<string, string | number | boolean>>
}

export interface SpawnSpec {
  readonly atTick: number
  readonly unit: UnitSpec
}

/** 一个阵营的费用池。回复是每游戏秒，上限在加费和自然回复时夹住。 */
export interface CostPoolSpec {
  readonly initial: number
  readonly regen: number
  readonly cap: number
}

export interface BattleSpec {
  readonly seed: number
  readonly modules: readonly string[]
  readonly tiles: readonly TileSpec[]
  readonly units: readonly UnitSpec[]
  readonly spawns: readonly SpawnSpec[]
  readonly deployStrategy: string | null
  readonly cost: {
    readonly ally: CostPoolSpec
    readonly enemy: CostPoolSpec
  }
  /** Facts content modules read for this battle. Absent means there are none. */
  readonly notes?: Readonly<Record<string, unknown>>
}
