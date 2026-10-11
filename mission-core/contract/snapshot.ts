import type { Direction, TileCoord, UnitAttributes, UnitKind, UnitSide } from "#contract/spec.js"

/** 一个技能的技力与弹药读数。 */
export interface SkillSnapshot {
  readonly id: string
  readonly sp: number
  readonly spCost: number
  readonly charges: number
  readonly active: boolean
  /** ammo 技能持续中、单位在场时的剩余弹药（向上取整）与弹匣；其余时候是 null。 */
  readonly ammo: { readonly left: number; readonly max: number } | null
}

/** 倒下之后等待再部署的计时，秒。 */
export interface RedeploySnapshot {
  readonly elapsed: number
  readonly duration: number
}

export interface UnitSnapshot {
  readonly id: string
  readonly side: UnitSide
  readonly kind: UnitKind
  readonly x: number
  readonly y: number
  readonly facing: Direction
  /** 所在地块的高度。不在地块上时是 0。 */
  readonly height: number
  readonly attributes: UnitAttributes
  /** 单位持有的标签 id，不分来源；路线消失时加上 hidden。按 id 排序。 */
  readonly tags: readonly string[]
  readonly attackRange: readonly TileCoord[]
  readonly deployPositions: readonly string[]
  readonly elements: Readonly<Record<string, number>>
  readonly blocking: readonly string[]
  readonly blockedBy: string | null
  readonly skills: readonly SkillSnapshot[]
  /** 状态护盾与护盾池的合计。 */
  readonly shield: number
  readonly downed: boolean
  /** 倒下时的再部署计时；没倒下时是 null。 */
  readonly redeploy: RedeploySnapshot | null
  /** 组件给画面的显示值，键是组件 id。只给画面，不计入状态。 */
  readonly components: Readonly<Record<string, unknown>>
}

export interface BattleSnapshot {
  readonly tick: number
  readonly units: readonly UnitSnapshot[]
}
