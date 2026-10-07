import { MIN_DAMAGE_RATIO } from "#battle/damage/constants.js"

export interface Penetration {
  defIgnorePct: number
  defIgnoreFlat: number
  resIgnorePct: number
  resIgnoreFlat: number
}

export const NO_PENETRATION: Penetration = {
  defIgnorePct: 0,
  defIgnoreFlat: 0,
  resIgnorePct: 0,
  resIgnoreFlat: 0,
}

/** 物理、法术、真实、元素伤害的减伤。未知种类保持原值。 */
export function mitigate(
  amount: number,
  kind: string,
  defense: number,
  resistance: number,
  elementalRes: number,
  ignore: Penetration,
): number {
  if (kind === "physical") {
    const eff = Math.max(0, defense * (1 - clamp01(ignore.defIgnorePct)) - ignore.defIgnoreFlat)
    return Math.max(amount - eff, MIN_DAMAGE_RATIO * amount)
  }
  if (kind === "arts") {
    const eff = Math.max(0, resistance * (1 - clamp01(ignore.resIgnorePct)) - ignore.resIgnoreFlat)
    return Math.max(amount * (1 - Math.min(100, eff) / 100), MIN_DAMAGE_RATIO * amount)
  }
  if (kind === "elemental") {
    const resisted = Math.max(0, Math.min(100, elementalRes))
    return Math.max(amount * (1 - resisted / 100), MIN_DAMAGE_RATIO * amount)
  }
  return amount
}

export function clamp01(value: number): number {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

/** 管道内部只用 physical / arts / true / elemental / element。 */
export function canonicalKind(kind: string): string {
  if (kind === "phys" || kind === "physical") return "physical"
  if (kind === "arts") return "arts"
  if (kind === "true") return "true"
  if (kind === "elemental") return "elemental"
  if (kind === "element") return "element"
  return kind
}
