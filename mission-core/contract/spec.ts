export const unitSides = ["ally", "enemy"] as const

export type UnitSide = (typeof unitSides)[number]

export const directions = ["UP", "RIGHT", "DOWN", "LEFT"] as const

export type Direction = (typeof directions)[number]

export const motions = ["WALK", "FLY"] as const

export type Motion = (typeof motions)[number]

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

export const spTypes = ["time", "attack", "hurt", "none"] as const

export type SpType = (typeof spTypes)[number]

export const skillOperations = ["MANUAL", "AUTO"] as const

export type SkillOperation = (typeof skillOperations)[number]

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

export interface UnitSpec {
  readonly id: string
  readonly side: UnitSide
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
   * 免疫名单，名字与 master 的 def.immune 相同。
   * 冻结是 frozen，恐惧和战栗是 feared，其余与状态 id 相同。
   */
  readonly immunity?: readonly string[]
}

export interface SpawnSpec {
  readonly atTick: number
  readonly unit: UnitSpec
}

export interface BattleSpec {
  readonly seed: number
  readonly modules: readonly string[]
  readonly tiles: readonly TileSpec[]
  readonly units: readonly UnitSpec[]
  readonly spawns: readonly SpawnSpec[]
  readonly deployStrategy: string | null
}
