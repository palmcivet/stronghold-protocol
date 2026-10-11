import { TICK } from "#kernel/tick/index.js"
import { hasTag } from "#kernel/world/tag.js"
import { LEVITATE } from "#port/tag.js"
import { cutStand } from "#combat/attack/stand.js"
import { cutSwing } from "#combat/attack/index.js"
import type { BattleWorld, UnitState } from "#unit/record/index.js"

/**
 * 失衡的秒数。推按受力等级（≤ −3 没有，≥ 3 按 3）；拉按作用时间，受力等级低于 −1 时减半；
 * 失衡硬直的保底是 UNBALANCE_MIN，推不动的一下与静态刚体都按它。
 */
// TRACE: source/unbalance
export const PUSH_UNBALANCE: Readonly<Record<number, number>> = Object.freeze({
  [-2]: 0.2,
  [-1]: 0.4,
  0: 0.8,
  1: 0.9,
  2: 32 / 30,
  3: 35 / 30,
})
export const PULL_UNBALANCE = 1
export const PULL_UNBALANCE_WEAK = 0.5
export const UNBALANCE_MIN = 0.1

/** 推的失衡秒数。 */
export function pushUnbalance(level: number): number {
  if (level <= -3) return 0
  return PUSH_UNBALANCE[Math.min(3, level)] ?? 0
}

/** 拉的失衡秒数：作用时间。 */
export function pullUnbalance(level: number): number {
  if (level <= -3) return 0
  return level < -1 ? PULL_UNBALANCE_WEAK : PULL_UNBALANCE
}

/**
 * 进入失衡 seconds 秒，正在的失衡更长时保留。失衡是状态机，不是效果：不能自主移动（恐惧、诱导也停）、
 * 不开始普攻，前摇中的一下被打断，攻击片段的站定结束。
 */
export function unbalanceUnit(state: BattleWorld, unit: UnitState, seconds: number): void {
  if (!(seconds > 0) || !unit.fielded || unit.downed || unit.removed) return
  const until = state.tick + Math.round(seconds / TICK)
  if (unit.unbalanceUntil === null || unit.unbalanceUntil < until) unit.unbalanceUntil = until
  cutStand(state, unit.id)
  cutSwing(unit)
}

/** 立刻结束失衡：浮空、路线上的出现、内容命令。 */
export function cutUnbalance(unit: UnitState): void {
  unit.unbalanceUntil = null
}

/** 每拍在移动之前：到时的失衡清掉，浮空结束失衡。 */
export function settleUnbalance(state: BattleWorld, unit: UnitState): void {
  if (unit.unbalanceUntil === null) return
  if (state.tick >= unit.unbalanceUntil || hasTag(unit, LEVITATE)) unit.unbalanceUntil = null
}
