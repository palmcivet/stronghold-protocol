import type { UnitSide } from "#contract/spec.js"

export interface BattleResult {
  readonly finished: boolean
  readonly winner: UnitSide | null
}

/** 账本的一行。数额都是累计值。 */
export interface LedgerRow {
  /** 击倒的敌方单位数。记给最后一次造成伤害的单位。 */
  readonly kills: number
  /** 漏出的敌方单位数。记给漏出的单位。 */
  readonly leaks: number
  /** 从另一方身上实际扣掉的生命（damaged 的 applied），不含溢出与同阵营伤害。 */
  readonly damage: number
  /** 实际回复的生命。 */
  readonly healing: number
  /** 倒下的友方单位数。记给倒下的单位。 */
  readonly deaths: number
  /** 计入总数的敌方单位数。按出场项在开场时算好。 */
  readonly total: number
  /** 计入总数的敌方单位被击倒的次数。 */
  readonly killedInTotal: number
  /** 计入总数的敌方单位漏出的次数。 */
  readonly leakedInTotal: number
  /** min(total, killedInTotal + leakedInTotal)。 */
  readonly resolved: number
}

/** 按单位规格的 owner 记的账。核心不解释 owner。 */
export interface BattleLedger {
  /** 全场合计，包括没有 owner 的单位。 */
  readonly battle: LedgerRow
  /** 键是 owner，按第一次记账的顺序。 */
  readonly owners: Readonly<Record<string, LedgerRow>>
}
