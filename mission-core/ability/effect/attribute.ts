import type { BattleRegistry } from "#kernel/registry/index.js"
import { skillModSum } from "#ability/skill/modifier.js"
import type { AttributeModifier } from "#port/content.js"
import type { UnitState } from "#unit/record/index.js"
import { powi } from "#kernel/math/powi.js"

const MULTIPLIERS = new Set([
  "dmgDealt",
  "physDealt",
  "artsDealt",
  "dmgTaken",
  "physTaken",
  "artsTaken",
  "trueTaken",
  "elementalTaken",
  "elemTaken",
  "healingDealt",
  "healingTaken",
])

interface ModSum {
  add: number
  percent: number
  mul: number
  touched: boolean
}

/** 基础属性加上状态里的加算、百分比和乘算。乘算键没有基础值时从 1 开始。 */
export function attributeOf(unit: UnitState, registry: BattleRegistry, key: string): number {
  if (key === "dodgePhys" || key === "dodgeArts") return dodgeOf(unit, registry, key)
  const mods = sumMods(unit, registry, key)
  const fallback = MULTIPLIERS.has(key) ? 1 : 0
  const base = unit.base[key] ?? fallback
  const value = (base + mods.add) * (1 + mods.percent) * mods.mul
  if (!Number.isFinite(value)) return fallback
  return value
}

/** 单位或状态上是否写过这个属性。 */
export function carriesAttribute(unit: UnitState, registry: BattleRegistry, key: string): boolean {
  return unit.base[key] !== undefined || sumMods(unit, registry, key).touched
}

/** 最大生命。hp 与 maxHp 的修饰都算在内，当前生命不参与。 */
export function maxHpOf(unit: UnitState, registry: BattleRegistry): number {
  const hp = sumMods(unit, registry, "hp")
  const max = sumMods(unit, registry, "maxHp")
  const base = unit.base.maxHp ?? unit.base.hp ?? 1
  const value = (base + hp.add + max.add) * (1 + hp.percent + max.percent) * hp.mul * max.mul
  const fallback = Math.max(1, unit.base.maxHp ?? unit.base.hp ?? 1)
  if (!Number.isFinite(value) || !(value > 0)) return fallback
  return Math.max(1, value)
}

function applyLayer(sum: ModSum, modifier: AttributeModifier, stacks: number): void {
  sum.touched = true
  if (modifier.op === "add") sum.add += modifier.value * stacks
  else if (modifier.op === "percent") sum.percent += modifier.value * stacks
  else sum.mul *= stacks === 1 ? modifier.value : powi(modifier.value, stacks)
}

function eachModifier(unit: UnitState, registry: BattleRegistry, visit: (modifier: AttributeModifier, stacks: number) => void): void {
  for (const status of unit.statuses) {
    const definition = registry.requireStatus(status.id)
    const lists: readonly (readonly AttributeModifier[])[] = [definition.modifiers, status.runtimeModifiers]
    for (const list of lists) {
      for (const modifier of list) visit(modifier, status.stacks)
    }
  }
  for (const timed of unit.modifiers.values()) {
    if (!(timed.remaining > 0)) continue
    for (const modifier of timed.modifiers) visit(modifier, 1)
  }
}

function sumMods(unit: UnitState, registry: BattleRegistry, key: string): ModSum {
  const sum: ModSum = { add: 0, percent: 0, mul: 1, touched: false }
  eachModifier(unit, registry, (modifier, stacks) => {
    if (modifier.attribute === key) applyLayer(sum, modifier, stacks)
  })
  const skill = skillModSum(unit, key)
  return {
    add: sum.add + skill.add,
    percent: sum.percent + skill.percent,
    mul: sum.mul * skill.mul,
    touched: sum.touched || skill.touched,
  }
}

/** 多个闪避来源按独立检定叠：1 − Π(1 − p)^层数。只有一条时保留原值。 */
function dodgeOf(unit: UnitState, registry: BattleRegistry, key: "dodgePhys" | "dodgeArts"): number {
  const rolls: { p: number; stacks: number }[] = []
  const base = unit.base[key] ?? 0
  if (base > 0) rolls.push({ p: Math.min(1, base), stacks: 1 })
  eachModifier(unit, registry, (modifier, stacks) => {
    if (modifier.attribute !== key || modifier.op !== "add" || !(modifier.value > 0)) return
    rolls.push({ p: Math.min(1, modifier.value), stacks })
  })
  if (rolls.length === 0) return 0
  const first = rolls[0]
  if (rolls.length === 1 && first && first.stacks === 1) return first.p
  let miss = 1
  for (const roll of rolls) miss *= powi(1 - roll.p, roll.stacks)
  return Math.min(1, Math.max(0, 1 - miss))
}
