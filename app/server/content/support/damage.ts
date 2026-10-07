import { MIN_DAMAGE_RATIO } from "#server/content/support/constants.js"

function clamp01(value: number): number {
  if (!(value > 0)) return 0
  return value > 1 ? 1 : value
}

export interface DamageInfo {
  amount: number
  type: string
  element: string | null
  atkScale: number
  defIgnoreFlat: number
  defIgnorePct: number
  resIgnoreFlat: number
  resIgnorePct: number
  mul: number
  canDodge: boolean
  isSkill: boolean
  isSplash: boolean
  isAttack: boolean
  isProjectile: boolean
  tags: string[]
  cancel: boolean
  noSp: boolean
  ignoreSleep: boolean
  ignoreSelect: boolean
  sourceless: boolean
  attackId: number
  traitAlly: unknown
}

export function makeDamageInfo(source: Record<string, unknown> = {}): DamageInfo {
  const type = typeof source.type === "string" ? source.type : "phys"
  const amount = Number(source.amount)
  const tags = Array.isArray(source.tags) ? source.tags.map((tag) => String(tag)) : []
  return {
    amount: Number.isFinite(amount) ? amount : 0,
    type,
    element: typeof source.element === "string" ? source.element : null,
    atkScale: typeof source.atkScale === "number" ? source.atkScale : 1,
    defIgnoreFlat: typeof source.defIgnoreFlat === "number" ? source.defIgnoreFlat : 0,
    defIgnorePct: typeof source.defIgnorePct === "number" ? source.defIgnorePct : 0,
    resIgnoreFlat: typeof source.resIgnoreFlat === "number" ? source.resIgnoreFlat : 0,
    resIgnorePct: typeof source.resIgnorePct === "number" ? source.resIgnorePct : 0,
    mul: typeof source.mul === "number" ? source.mul : 1,
    canDodge: source.canDodge !== undefined ? source.canDodge === true : type === "phys" || type === "arts",
    isSkill: source.isSkill === true,
    isSplash: source.isSplash === true,
    isAttack: source.isAttack === true,
    isProjectile: source.isProjectile === true,
    tags,
    cancel: false,
    noSp: source.noSp === true,
    ignoreSleep: source.ignoreSleep === true,
    ignoreSelect: source.ignoreSelect === true,
    sourceless: source.sourceless === true,
    attackId: typeof source.attackId === "number" ? source.attackId : 0,
    traitAlly: source.traitAlly ?? null,
  }
}

export function periodicDamage(amount: number): DamageInfo {
  return makeDamageInfo({ amount, type: "true", canDodge: false, sourceless: true, tags: ["dot", "periodic"] })
}

export function isHpLoss(dmg: { tags?: readonly string[] } | null | undefined): boolean {
  return !!dmg && Array.isArray(dmg.tags) && dmg.tags.includes("hpLoss")
}

export function hasHp(unit: { alive?: boolean; hp?: number; bossPool?: { hp?: number } } | null | undefined): boolean {
  if (!unit || unit.alive === false) return false
  if (unit.bossPool) return (unit.bossPool.hp ?? 0) > 0
  return (unit.hp ?? 0) > 0
}

export function mitigate(amount: number, type: string, target: { def?: number; res?: number } | null | undefined, ign: { defIgnorePct?: number; defIgnoreFlat?: number; resIgnorePct?: number; resIgnoreFlat?: number; elementalRes?: number } = {}): number {
  if (type === "phys") {
    const defense = target?.def ?? 0
    const effective = Math.max(0, defense * (1 - clamp01(ign.defIgnorePct ?? 0)) - (ign.defIgnoreFlat ?? 0))
    return Math.max(amount - effective, MIN_DAMAGE_RATIO * amount)
  }
  if (type === "arts") {
    const res = target?.res ?? 0
    const effective = Math.max(0, res * (1 - clamp01(ign.resIgnorePct ?? 0)) - (ign.resIgnoreFlat ?? 0))
    return Math.max(amount * (1 - Math.min(100, effective) / 100), MIN_DAMAGE_RATIO * amount)
  }
  if (type === "elemental") {
    const resistance = Math.max(0, Math.min(100, Number.isFinite(ign.elementalRes) ? ign.elementalRes ?? 0 : 0))
    return Math.max(amount * (1 - resistance / 100), MIN_DAMAGE_RATIO * amount)
  }
  return amount
}
