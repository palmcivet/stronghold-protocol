import type { SkillModifier } from "#contract/spec.js"
import type { UnitState } from "#unit/record/index.js"

export interface ModSum {
  add: number
  percent: number
  mul: number
  touched: boolean
}

/** 正在生效的技能修饰。加算、百分比、乘算和状态修饰同一套汇总。 */
export function skillModSum(unit: UnitState, key: string): ModSum {
  let add = 0
  let percent = 0
  let mul = 1
  let touched = false
  for (const skill of unit.skills) {
    if (!skill.effectsApplied) continue
    for (const modifier of skill.mods) {
      if (modifier.attribute !== key) continue
      touched = true
      add += modifier.op === "add" ? modifier.value : 0
      percent += modifier.op === "percent" ? modifier.value : 0
      if (modifier.op === "mul") mul *= modifier.value
    }
  }
  return { add, percent, mul, touched }
}

export function skillFlagsOf(unit: UnitState): readonly string[] {
  const flags: string[] = []
  for (const skill of unit.skills) {
    if (!skill.effectsApplied) continue
    for (const flag of skill.skillFlags) flags.push(flag)
  }
  return flags
}

/** 把正在生效的技能修饰叠到快照属性上。当前生命不叠。 */
export function overlaySkillAttributes(unit: UnitState, attributes: Record<string, number>): void {
  const keys = new Set<string>()
  for (const skill of unit.skills) {
    if (!skill.effectsApplied) continue
    for (const modifier of skill.mods) if (modifier.attribute !== "hp") keys.add(modifier.attribute)
  }
  for (const key of keys) {
    const sum = skillModSum(unit, key)
    const current = attributes[key] ?? 0
    attributes[key] = (current + sum.add) * (1 + sum.percent) * sum.mul
  }
}

export function copyModifiers(mods: readonly SkillModifier[] | undefined): SkillModifier[] {
  if (!mods) return []
  return mods.map((modifier) => ({ attribute: modifier.attribute, op: modifier.op, value: modifier.value }))
}
