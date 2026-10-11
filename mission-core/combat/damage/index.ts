import type { ElementHitEvent, FatalEvent, HitEvent } from "#contract/event.js"
import type { ContentContext, HealOptions } from "#port/context.js"
import type { DamageInfo, DamagePreview } from "#port/definition.js"
import type { BattleRegistry } from "#port/definition.js"
import { BOSS_HIT_LIMIT, MIN_DAMAGE_RATIO } from "#combat/damage/constants.js"
import { canonicalKind, clamp01, mitigate, type Penetration } from "#combat/damage/formula.js"
import { knockDown } from "#unit/deploy/strategy.js"
import { emit, intercept } from "#kernel/event/index.js"
import { requireUnit, type BattleWorld } from "#unit/record/index.js"
import { attributeOf, carriesAttribute, maxHpOf } from "#ability/effect/attribute.js"
import { burstElement, chargeElement, hasHp } from "#combat/element/index.js"
import { peekGauges } from "#combat/element/gauge.js"
import { hasHitLimit } from "#combat/damage/limit.js"
import { overhealOf, setOverheal } from "#combat/damage/shield.js"
import { isFlying, type UnitState } from "#unit/record/index.js"
import { applyStatus } from "#ability/effect/index.js"
import { hasTag } from "#kernel/world/tag.js"
import {
  BURST_LOCK,
  HEAL_FREE,
  HIT_COUNT,
  HIT_COUNT_ARTS,
  HIT_SLEEP,
  INVULNERABLE,
  LIFTOFF,
  NO_HEAL,
  SLEEP,
} from "#port/tag.js"

export function registerDamageSteps(state: BattleWorld, registry: BattleRegistry): void {
  registry.registerDamageStep({
    id: "element",
    priority: 100,
    apply(info, ctx, pass) {
      if (info.kind !== "element" || info.cancel === true) return
      const elementId = info.element
      if (!elementId) {
        info.amount = 0
        return
      }
      const definition = registry.requireElement(elementId)
      const unit = requireUnit(state, info.targetId)
      const gauges = peekGauges(state, unit.id)
      const slot = gauges?.slots.get(elementId)
      if (!hasHp(unit) || gauges?.bursting === true || hasTag(unit, BURST_LOCK) || slot?.locked) {
        info.amount = 0
        return
      }
      if (!pass.preview) {
        const cancelled = publishElementHit(state, info)
        if (cancelled) return
        if (info.kind !== "element") {
          publishHit(state, info)
          return
        }
      }
      const resistance = carriesAttribute(unit, registry, "elementRes")
        ? attributeOf(unit, registry, "elementRes")
        : definition.resistance
      const factor = Math.max(MIN_DAMAGE_RATIO, 1 - clamp01(resistance / 100))
      let intake = info.amount * (info.mul ?? 1) * attributeOf(unit, registry, "elemTaken") * factor
      if (!(intake > 0) || !Number.isFinite(intake)) intake = 0
      info.amount = intake
      if (pass.preview || !(intake > 0)) return
      const charged = chargeElement(state, registry, info.targetId, elementId, intake)
      if (charged === "refused") {
        info.amount = 0
        return
      }
      if (charged === "burst") burstElement(state, registry, ctx, info.targetId, elementId, info.sourceId)
    },
  })
  registry.registerDamageStep({
    id: "dodge",
    priority: 150,
    apply(info, _ctx, pass) {
      if (pass.preview || skipHp(info) || !canDodge(info)) return
      const target = requireUnit(state, info.targetId)
      const chance = info.kind === "arts" ? attributeOf(target, registry, "dodgeArts") : attributeOf(target, registry, "dodgePhys")
      if (!(chance > 0) || !(state.random() < chance)) return
      info.amount = 0
      info.cancel = true
    },
  })
  registry.registerDamageStep({
    id: "mitigate",
    priority: 200,
    apply(info) {
      if (skipHp(info)) return
      const target = requireUnit(state, info.targetId)
      if (countHit(target, info)) return
      info.amount = mitigate(
        info.amount,
        info.kind,
        Math.max(0, attributeOf(target, registry, "def")),
        Math.min(100, Math.max(0, attributeOf(target, registry, "res"))),
        attributeOf(target, registry, "elementalRes"),
        penetration(state, registry, info),
      )
    },
  })
  registry.registerDamageStep({
    id: "multiplier",
    priority: 300,
    apply(info) {
      if (skipHp(info)) return
      const target = requireUnit(state, info.targetId)
      if (countHit(target, info)) return
      const source = info.sourceless === true ? null : findUnit(state, info.sourceId)
      info.amount *= takenMultiplier(target, registry, source, info)
      if (!(info.amount > 0) || !Number.isFinite(info.amount)) info.amount = 0
    },
  })
  registry.registerDamageStep({
    id: "boss-limit",
    priority: 400,
    apply(info) {
      if (skipHp(info)) return
      const target = requireUnit(state, info.targetId)
      if (countHit(target, info)) return
      if (!hasHitLimit(state, target.id)) return
      if (!(Math.ceil(info.amount) >= BOSS_HIT_LIMIT)) return
      info.amount = 0
      info.cancel = true
    },
  })
  registry.registerDamageStep({
    id: "shield",
    priority: 600,
    apply(info, _ctx, pass) {
      if (skipHp(info)) return
      const target = requireUnit(state, info.targetId)
      info.amount = absorb(state, target, info.amount, !pass.preview)
    },
  })
  registry.registerDamageStep({
    id: "hp",
    priority: 1000,
    apply(info, ctx, pass) {
      if (skipHp(info) || pass.preview) return
      const target = requireUnit(state, info.targetId)
      applyLife(state, registry, ctx, target, info.amount, info.sourceId, info.sourceless === true, true, info.kind, info.attack === true)
    },
  })
}

export function runDamage(
  state: BattleWorld,
  registry: BattleRegistry,
  ctx: ContentContext,
  request: DamageInfo,
  preview: boolean,
): DamagePreview {
  const info = cloneInfo(request)
  const pass = { preview }
  const target = state.units.get(info.targetId)
  if (!target || target.downed) return viewed(info, [])
  if (refuses(target, attackingSource(state, info), info, true)) {
    info.amount = 0
    info.cancel = true
    return viewed(info, [])
  }
  if (!preview && info.kind !== "element") {
    publishHit(state, info)
    if (info.cancel === true) return viewed(info, [])
    const current = state.units.get(info.targetId)
    if (!current || current.downed) return viewed(info, [])
    if (refuses(current, attackingSource(state, info), info, false)) {
      info.amount = 0
      info.cancel = true
      return viewed(info, [])
    }
  }
  const steps: string[] = []
  for (const step of registry.damageSteps()) {
    step.apply(info, ctx, pass)
    steps.push(step.id)
  }
  return viewed(info, steps)
}

export function healUnit(
  state: BattleWorld,
  registry: BattleRegistry,
  ctx: ContentContext,
  unitId: string,
  amount: number,
  options?: HealOptions,
): void {
  const unit = requireUnit(state, unitId)
  if (unit.downed || !(amount > 0) || !Number.isFinite(amount)) return
  const self = options?.self === true || options?.sourceId === unitId
  if (!self && hasTag(unit, NO_HEAL)) return
  if (hasTag(unit, HEAL_FREE) && options?.regen !== true && options?.ignoreHealFree !== true) return
  const source = options?.sourceId ? findUnit(state, options.sourceId) : null
  const dealt = source ? attributeOf(source, registry, "healingDealt") : 1
  let healed = amount * dealt * attributeOf(unit, registry, "healingTaken")
  if (!(healed > 0) || !Number.isFinite(healed)) return
  const max = maxHpOf(unit, registry)
  const hp = unit.attributes.hp ?? 0
  const actual = Math.max(0, Math.min(healed, max - hp))
  unit.attributes.hp = Math.min(max, hp + actual)
  if (options?.overheal === true && healed > actual) {
    const over = overhealOf(state, unitId)
    const next = Math.min(max, over + (healed - actual))
    const pool = unit.attributes.shield ?? 0
    unit.attributes.shield = pool - over + next
    setOverheal(state, unitId, next)
    const duration = options.overhealDuration ?? Number.POSITIVE_INFINITY
    applyOverheal(state, registry, ctx, unitId, next, duration)
  }
  emit(state, "heal", {
    unitId,
    sourceId: options?.sourceId ?? "",
    amount: actual,
    hp: unit.attributes.hp ?? 0,
  })
}

function applyOverheal(
  state: BattleWorld,
  registry: BattleRegistry,
  ctx: ContentContext,
  unitId: string,
  shield: number,
  duration: number,
): void {
  applyStatus(state, registry, ctx, unitId, "overheal", { duration, value: shield })
}

/** 流失。不减防御和法抗，不进伤害步骤。达到首领限伤时整段取消，不扣生命。 */
export function loseLife(
  state: BattleWorld,
  registry: BattleRegistry,
  ctx: ContentContext,
  unitId: string,
  amount: number,
): void {
  const unit = requireUnit(state, unitId)
  if (unit.downed || !(amount > 0) || !Number.isFinite(amount)) return
  if (hasHitLimit(state, unitId) && Math.ceil(amount) >= BOSS_HIT_LIMIT) return
  applyLife(state, registry, ctx, unit, amount, "", false, false, "true", false)
}

// MARK: life

function applyLife(
  state: BattleWorld,
  registry: BattleRegistry,
  ctx: ContentContext,
  unit: UnitState,
  amount: number,
  credit: string,
  sourceless: boolean,
  damaged: boolean,
  kind: string,
  attack: boolean,
): void {
  const before = unit.attributes.hp ?? 0
  if (before - amount <= 0) {
    unit.attributes.hp = 0
    const fatal: FatalEvent = {
      sourceId: sourceless ? "" : credit,
      creditId: credit,
      targetId: unit.id,
      amount,
      kind,
      prevented: false,
      sourceless,
    }
    intercept(state, "fatal", fatal)
    if (fatal.prevented === true) unit.attributes.hp = Math.min(1, maxHpOf(unit, registry))
  } else {
    unit.attributes.hp = before - amount
  }
  const hp = unit.attributes.hp ?? 0
  if (damaged) {
    emit(state, "damaged", {
      sourceId: sourceless ? "" : credit,
      creditId: credit,
      targetId: unit.id,
      amount,
      applied: Math.max(0, before - hp),
      kind,
      hp,
      sourceless,
      ...(attack ? { attack: true } : {}),
    })
  } else {
    emit(state, "loss", { unitId: unit.id, amount, hp })
  }
  if (hp <= 0) knockDown(state, registry, ctx, unit.id)
}

function absorb(state: BattleWorld, unit: UnitState, amount: number, commit: boolean): number {
  if (!(amount > 0)) return 0
  let rest = amount
  for (const status of unit.statuses) {
    if (!(rest > 0)) break
    if (status.shieldHits > 0) {
      if (commit) status.shieldHits -= 1
      return 0
    }
  }
  const hits = unit.attributes.shieldHits ?? 0
  if (rest > 0 && hits > 0) {
    if (commit) unit.attributes.shieldHits = hits - 1
    return 0
  }
  for (const status of unit.statuses) {
    if (!(rest > 0)) break
    if (!(status.shield > 0)) continue
    const take = Math.min(status.shield, rest)
    if (commit) status.shield -= take
    rest -= take
  }
  const pool = unit.attributes.shield ?? 0
  if (rest > 0 && pool > 0) {
    const take = Math.min(pool, rest)
    if (commit) {
      const over = overhealOf(state, unit.id)
      const combat = Math.max(0, pool - over)
      const overTake = Math.max(0, take - combat)
      if (over !== 0) setOverheal(state, unit.id, Math.max(0, over - overTake))
      unit.attributes.shield = pool - take
    }
    rest -= take
  }
  return rest
}

// MARK: info

function cloneInfo(request: DamageInfo): DamageInfo {
  const info: DamageInfo = {
    sourceId: request.sourceId,
    targetId: request.targetId,
    amount: Number.isFinite(request.amount) ? request.amount : 0,
    kind: canonicalKind(request.kind),
  }
  if (request.mul !== undefined) info.mul = request.mul
  if (request.defIgnorePct !== undefined) info.defIgnorePct = request.defIgnorePct
  if (request.defIgnoreFlat !== undefined) info.defIgnoreFlat = request.defIgnoreFlat
  if (request.resIgnorePct !== undefined) info.resIgnorePct = request.resIgnorePct
  if (request.resIgnoreFlat !== undefined) info.resIgnoreFlat = request.resIgnoreFlat
  if (request.element !== undefined) info.element = request.element
  if (request.canDodge !== undefined) info.canDodge = request.canDodge
  if (request.sourceless !== undefined) info.sourceless = request.sourceless
  if (request.ignoreSleep !== undefined) info.ignoreSleep = request.ignoreSleep
  if (request.ignoreSelect !== undefined) info.ignoreSelect = request.ignoreSelect
  if (request.cancel !== undefined) info.cancel = request.cancel
  if (request.attack !== undefined) info.attack = request.attack
  return info
}

function viewed(info: DamageInfo, steps: readonly string[]): DamagePreview {
  return {
    sourceId: info.sourceId,
    targetId: info.targetId,
    amount: info.amount,
    kind: info.kind,
    steps,
  }
}

function publishElementHit(state: BattleWorld, info: DamageInfo): boolean {
  const hit: ElementHitEvent = {
    sourceId: info.sourceless === true ? "" : info.sourceId,
    creditId: info.sourceId,
    targetId: info.targetId,
    amount: info.amount,
    mul: info.mul ?? 1,
    kind: info.kind,
    cancel: false,
    sourceless: info.sourceless === true,
    ...(info.element !== undefined ? { element: info.element } : {}),
  }
  intercept(state, "element-hit", hit)
  if (typeof hit.amount === "number" && Number.isFinite(hit.amount)) info.amount = hit.amount
  if (typeof hit.mul === "number" && Number.isFinite(hit.mul)) info.mul = hit.mul
  if (typeof hit.kind === "string") info.kind = canonicalKind(hit.kind)
  const cancelled = hit.cancel === true
  if (cancelled) info.cancel = true
  return cancelled
}

function publishHit(state: BattleWorld, info: DamageInfo): void {
  const hit: HitEvent = {
    sourceId: info.sourceless === true ? "" : info.sourceId,
    creditId: info.sourceId,
    targetId: info.targetId,
    amount: info.amount,
    kind: info.kind,
    cancel: false,
    sourceless: info.sourceless === true,
    ...(info.element !== undefined ? { element: info.element } : {}),
  }
  intercept(state, "hit", hit)
  if (typeof hit.amount === "number" && Number.isFinite(hit.amount)) info.amount = hit.amount
  if (typeof hit.kind === "string") info.kind = canonicalKind(hit.kind)
  if (hit.cancel === true) info.cancel = true
  if (typeof hit.mul === "number" && Number.isFinite(hit.mul)) info.mul = hit.mul
}

function penetration(state: BattleWorld, registry: BattleRegistry, info: DamageInfo): Penetration {
  const source = info.sourceless === true ? null : findUnit(state, info.sourceId)
  return {
    defIgnorePct: (info.defIgnorePct ?? 0) + (source ? attributeOf(source, registry, "defIgnorePct") : 0),
    defIgnoreFlat: (info.defIgnoreFlat ?? 0) + (source ? attributeOf(source, registry, "defIgnoreFlat") : 0),
    resIgnorePct: (info.resIgnorePct ?? 0) + (source ? attributeOf(source, registry, "resIgnorePct") : 0),
    resIgnoreFlat: (info.resIgnoreFlat ?? 0) + (source ? attributeOf(source, registry, "resIgnoreFlat") : 0),
  }
}

function takenMultiplier(target: UnitState, registry: BattleRegistry, source: UnitState | null, info: DamageInfo): number {
  let mul = info.mul ?? 1
  if (info.kind !== "elemental") mul *= attributeOf(target, registry, "dmgTaken")
  if (source) {
    mul *= attributeOf(source, registry, "dmgDealt")
    if (info.kind === "physical") mul *= attributeOf(source, registry, "physDealt")
    else if (info.kind === "arts") mul *= attributeOf(source, registry, "artsDealt")
  }
  if (info.kind === "physical") mul *= attributeOf(target, registry, "physTaken")
  else if (info.kind === "arts") mul *= attributeOf(target, registry, "artsTaken")
  else if (info.kind === "elemental") mul *= attributeOf(target, registry, "elementalTaken")
  else mul *= attributeOf(target, registry, "trueTaken")
  return mul
}

function attackingSource(state: BattleWorld, info: DamageInfo): UnitState | null {
  if (info.sourceless === true) return null
  return findUnit(state, info.sourceId)
}

/**
 * 无敌、沉睡、起飞挡在命中之前。起飞只在命中前查一次。
 * 忽略沉睡的伤害与带 HIT_SLEEP 的攻击者照常打到沉睡的目标。
 */
function refuses(target: UnitState, source: UnitState | null, info: DamageInfo, liftoff: boolean): boolean {
  if (hasTag(target, INVULNERABLE)) return true
  if (hasTag(target, SLEEP) && info.ignoreSleep !== true && !(source && hasTag(source, HIT_SLEEP))) return true
  if (!liftoff || info.ignoreSelect === true || !source || source.side !== "enemy" || isFlying(source)) return false
  return hasTag(target, LIFTOFF)
}

/** 受击次数把这一下收成 1 点，并跳过减伤、乘区和首领限伤。只数法术的次数放过物理。 */
function countHit(target: UnitState, info: DamageInfo): boolean {
  const any = hasTag(target, HIT_COUNT)
  const arts = hasTag(target, HIT_COUNT_ARTS)
  if (!any && !arts) return false
  const ignored = arts && !any && info.kind === "physical"
  info.amount = ignored ? 0 : 1
  return true
}

function canDodge(info: DamageInfo): boolean {
  if (info.canDodge !== undefined) return info.canDodge
  return info.kind === "physical" || info.kind === "arts"
}

function skipHp(info: DamageInfo): boolean {
  return info.cancel === true || info.kind === "element"
}

function findUnit(state: BattleWorld, unitId: string): UnitState | null {
  if (!unitId) return null
  return state.units.get(unitId) ?? null
}
