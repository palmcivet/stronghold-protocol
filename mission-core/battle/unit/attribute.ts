import type { BattleRegistry } from "#battle/registry.js"
import { skillModSum } from "#battle/skill/modifier.js"
import type { AttributeModifier } from "#port/content.js"
import type { UnitState } from "#battle/unit/index.js"

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

function sumMods(unit: UnitState, registry: BattleRegistry, key: string): ModSum {
  let add = 0
  let percent = 0
  let mul = 1
  let touched = false
  for (const status of unit.statuses) {
    const definition = registry.requireStatus(status.id)
    const lists: readonly (readonly AttributeModifier[])[] = [definition.modifiers, status.runtimeModifiers]
    for (const list of lists) {
      for (const modifier of list) {
        if (modifier.attribute !== key) continue
        touched = true
        const stacks = status.stacks
        if (modifier.op === "add") add += modifier.value * stacks
        else if (modifier.op === "percent") percent += modifier.value * stacks
        else mul *= stacks === 1 ? modifier.value : Math.pow(modifier.value, stacks)
      }
    }
  }
  const skill = skillModSum(unit, key)
  return {
    add: add + skill.add,
    percent: percent + skill.percent,
    mul: mul * skill.mul,
    touched: touched || skill.touched,
  }
}

/** 多个闪避来源按独立检定叠：1 − Π(1 − p)^层数。只有一条时保留原值。 */
function dodgeOf(unit: UnitState, registry: BattleRegistry, key: "dodgePhys" | "dodgeArts"): number {
  const rolls: { p: number; stacks: number }[] = []
  const base = unit.base[key] ?? 0
  if (base > 0) rolls.push({ p: Math.min(1, base), stacks: 1 })
  for (const status of unit.statuses) {
    const definition = registry.requireStatus(status.id)
    const lists: readonly (readonly AttributeModifier[])[] = [definition.modifiers, status.runtimeModifiers]
    for (const list of lists) {
      for (const modifier of list) {
        if (modifier.attribute !== key || modifier.op !== "add" || !(modifier.value > 0)) continue
        rolls.push({ p: Math.min(1, modifier.value), stacks: status.stacks })
      }
    }
  }
  if (rolls.length === 0) return 0
  const first = rolls[0]
  if (rolls.length === 1 && first && first.stacks === 1) return first.p
  let miss = 1
  for (const roll of rolls) miss *= Math.pow(1 - roll.p, roll.stacks)
  return Math.min(1, Math.max(0, 1 - miss))
}
