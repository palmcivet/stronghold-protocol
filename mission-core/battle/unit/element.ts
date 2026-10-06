import type { ContentContext } from "#port/content.js"
import type { BattleRegistry } from "#battle/registry.js"
import { drainSkillSp } from "#battle/skill/point.js"
import { emit, requireUnit, type BattleState } from "#battle/state.js"
import { ELEMENT, ELEMENT_GAUGE_MAX } from "#battle/damage/constants.js"
import { TICK } from "#tick/index.js"
import type { UnitState } from "#battle/unit/index.js"

export function hasHp(unit: UnitState): boolean {
  return !unit.downed && (unit.attributes.hp ?? 0) > 0
}

/** 爆发冷却结束，这个单位每种元素槽都归零。 */
export function clearElements(unit: UnitState): void {
  for (const slot of unit.elements.values()) {
    slot.value = 0
    slot.locked = false
  }
}

export type Charge = "burst" | "filled" | "refused"

/** 把已经算好的损伤加进槽。返回值表示有没有蓄满。 */
export function chargeElement(
  state: BattleState,
  registry: BattleRegistry,
  unitId: string,
  elementId: string,
  amount: number,
): Charge {
  const definition = registry.requireElement(elementId)
  const unit = requireUnit(state, unitId)
  if (!hasHp(unit) || unit.bursting || unit.flags.has("burstLock")) return "refused"
  if (!(amount > 0) || !Number.isFinite(amount)) return "refused"
  const cap = gaugeCap(unit, definition.cap)
  const existing = unit.elements.get(elementId)
  const slot = existing ?? { value: 0, locked: false }
  if (!existing) unit.elements.set(elementId, slot)
  if (slot.locked) return "refused"
  slot.value += amount
  if (slot.value < cap) return "filled"
  slot.value = cap
  slot.locked = true
  return "burst"
}

/** 蓄满后的爆发。爆发自己的伤害不再次进槽。 */
export function burstElement(
  state: BattleState,
  registry: BattleRegistry,
  ctx: ContentContext,
  unitId: string,
  elementId: string,
  sourceId: string,
): void {
  const definition = registry.requireElement(elementId)
  const unit = requireUnit(state, unitId)
  if (unit.bursting || unit.flags.has("burstLock")) return
  unit.elementCredit = sourceId
  unit.bursting = true
  try {
    emit(state, "elementBurst", { sourceId, targetId: unitId, element: elementId })
    definition.onBurst?.(unitId, ctx, sourceId)
  } finally {
    unit.bursting = false
  }
}

export function addElement(
  state: BattleState,
  registry: BattleRegistry,
  ctx: ContentContext,
  unitId: string,
  elementId: string,
  amount: number,
  sourceId = "",
): void {
  const charged = chargeElement(state, registry, unitId, elementId, amount)
  if (charged === "burst") burstElement(state, registry, ctx, unitId, elementId, sourceId)
}

export function registerBuiltinElements(state: BattleState, registry: BattleRegistry): void {
  const second = secondsToTicks(1)
  const strike = (
    ctx: ContentContext,
    sourceId: string,
    unitId: string,
    element: string,
    amount: number,
    kind: string,
  ): void => {
    const unit = state.units.get(unitId)
    if (!unit || !hasHp(unit)) return
    ctx.dealDamage({
      sourceId,
      targetId: unitId,
      amount,
      kind,
      element,
      canDodge: false,
      sourceless: true,
    })
  }
  const arm = (ctx: ContentContext, unitId: string, statusId: string, seconds: number): void => {
    ctx.applyStatus(unitId, statusId)
    const status = requireUnit(state, unitId).statuses.find((item) => item.id === statusId)
    if (!status) return
    status.permanent = !(seconds > 0)
    status.remaining = secondsToTicks(seconds)
  }

  // MARK: burn
  registry.registerStatus({
    id: "element:burn-burst",
    flags: ["burstLock"],
    modifiers: [{ attribute: "res", op: "add", value: -ELEMENT.burn.ally.resDown }],
    immunity: [],
    stackCap: 1,
    cancels: [],
    duration: secondsToTicks(ELEMENT.burn.ally.duration),
  })
  registry.registerElement({
    id: "burn",
    cap: ELEMENT_GAUGE_MAX,
    resistance: 0,
    onBurst(unitId, ctx, sourceId = "") {
      const unit = requireUnit(state, unitId)
      const enemy = unit.side === "enemy"
      const side = enemy ? ELEMENT.burn.enemy : ELEMENT.burn.ally
      arm(ctx, unitId, "element:burn-burst", side.duration)
      if (!hasHp(requireUnit(state, unitId))) return
      if (enemy) strike(ctx, sourceId, unitId, "burn", ELEMENT.burn.enemy.elemDamage, "elemental")
      else strike(ctx, sourceId, unitId, "burn", ELEMENT.burn.ally.damage, damageKind(ELEMENT.burn.ally.type))
    },
  })

  // MARK: neural
  registry.registerStatus({
    id: "element:neural-ally",
    flags: ["burstLock", "stun"],
    modifiers: [],
    immunity: [],
    stackCap: 1,
    cancels: ["attack"],
    duration: secondsToTicks(ELEMENT.neural.ally.duration),
  })
  registry.registerStatus({
    id: "element:neural-enemy",
    flags: ["burstLock"],
    modifiers: [],
    immunity: [],
    stackCap: 1,
    cancels: [],
    duration: secondsToTicks(ELEMENT.neural.enemy.duration),
  })
  registry.registerElement({
    id: "neural",
    cap: ELEMENT_GAUGE_MAX,
    resistance: 0,
    onBurst(unitId, ctx, sourceId = "") {
      const unit = requireUnit(state, unitId)
      const enemy = unit.side === "enemy"
      if (enemy) {
        arm(ctx, unitId, "element:neural-enemy", ELEMENT.neural.enemy.duration)
        for (let stack = 0; stack < ELEMENT.neural.enemy.palsy; stack += 1) ctx.applyStatus(unitId, "palsy")
        if (hasHp(requireUnit(state, unitId))) {
          strike(ctx, sourceId, unitId, "neural", ELEMENT.neural.enemy.elemDamage, "elemental")
        }
        return
      }
      arm(ctx, unitId, "element:neural-ally", ELEMENT.neural.ally.duration)
      if (hasHp(requireUnit(state, unitId))) {
        strike(ctx, sourceId, unitId, "neural", ELEMENT.neural.ally.damage, damageKind(ELEMENT.neural.ally.type))
      }
    },
  })

  // MARK: apoptosis
  registry.registerStatus({
    id: "element:apoptosis-ally",
    flags: ["burstLock", "silence", "noSp"],
    modifiers: [],
    immunity: [],
    stackCap: 1,
    cancels: [],
    duration: secondsToTicks(ELEMENT.apoptosis.ally.duration),
    onTick(unitId, _stacks, ctx) {
      const unit = requireUnit(state, unitId)
      const status = unit.statuses.find((item) => item.id === "element:apoptosis-ally")
      if (!status) return
      status.pulse += 1
      if (status.pulse % second !== 0) return
      drainSkillSp(state, unitId, ELEMENT.apoptosis.ally.spLossPerSec)
      strike(ctx, unit.elementCredit, unitId, "apoptosis", ELEMENT.apoptosis.ally.dps, damageKind(ELEMENT.apoptosis.ally.dpsType))
    },
  })
  registry.registerStatus({
    id: "element:apoptosis-enemy",
    flags: ["burstLock"],
    modifiers: [],
    immunity: [],
    stackCap: 1,
    cancels: [],
    duration: secondsToTicks(ELEMENT.apoptosis.enemy.duration),
    onTick(unitId, _stacks, ctx) {
      const unit = requireUnit(state, unitId)
      const status = unit.statuses.find((item) => item.id === "element:apoptosis-enemy")
      if (!status) return
      const duration = ELEMENT.apoptosis.enemy.duration
      const left = Math.max(0, status.remaining * TICK)
      const weaken = ELEMENT.apoptosis.enemy.weaken * (left / duration)
      status.runtimeModifiers = [{ attribute: "atk", op: "mul", value: 1 - weaken }]
      status.pulse += 1
      if (status.pulse % second !== 0) return
      strike(ctx, unit.elementCredit, unitId, "apoptosis", ELEMENT.apoptosis.enemy.elemDps, "elemental")
    },
  })
  registry.registerElement({
    id: "apoptosis",
    cap: ELEMENT_GAUGE_MAX,
    resistance: 0,
    onBurst(unitId, ctx) {
      const unit = requireUnit(state, unitId)
      if (unit.side === "enemy") {
        arm(ctx, unitId, "element:apoptosis-enemy", ELEMENT.apoptosis.enemy.duration)
        const status = requireUnit(state, unitId).statuses.find((item) => item.id === "element:apoptosis-enemy")
        if (status) {
          status.runtimeModifiers = [{ attribute: "atk", op: "mul", value: 1 - ELEMENT.apoptosis.enemy.weaken }]
        }
        return
      }
      arm(ctx, unitId, "element:apoptosis-ally", ELEMENT.apoptosis.ally.duration)
    },
  })

  // MARK: erosion
  registry.registerStatus({
    id: "element:erosion-burst",
    flags: ["burstLock"],
    modifiers: [],
    immunity: [],
    stackCap: 1,
    cancels: [],
    duration: secondsToTicks(ELEMENT.erosion.ally.duration),
  })
  registry.registerStatus({
    id: "element:erosion-down",
    flags: [],
    modifiers: [],
    immunity: [],
    stackCap: 1_000_000,
    cancels: [],
    duration: 0,
  })
  registry.registerElement({
    id: "erosion",
    cap: ELEMENT_GAUGE_MAX,
    resistance: 0,
    onBurst(unitId, ctx, sourceId = "") {
      const unit = requireUnit(state, unitId)
      const enemy = unit.side === "enemy"
      const side = enemy ? ELEMENT.erosion.enemy : ELEMENT.erosion.ally
      arm(ctx, unitId, "element:erosion-burst", side.duration)
      ctx.applyStatus(unitId, "element:erosion-down")
      const down = requireUnit(state, unitId).statuses.find((item) => item.id === "element:erosion-down")
      if (down) down.runtimeModifiers = [{ attribute: "def", op: "add", value: -side.defDown }]
      if (!hasHp(requireUnit(state, unitId))) return
      if (enemy) strike(ctx, sourceId, unitId, "erosion", ELEMENT.erosion.enemy.elemDamage, "elemental")
      else strike(ctx, sourceId, unitId, "erosion", ELEMENT.erosion.ally.damage, damageKind(ELEMENT.erosion.ally.type))
    },
  })

  // MARK: necrosis
  registry.registerStatus({
    id: "element:necrosis-burst",
    flags: ["burstLock"],
    modifiers: [{ attribute: "atk", op: "mul", value: 1 - ELEMENT.necrosis.atkDownPct }],
    immunity: [],
    stackCap: 1,
    cancels: [],
    duration: secondsToTicks(ELEMENT.necrosis.duration),
    onTick(unitId, _stacks, ctx) {
      const unit = requireUnit(state, unitId)
      const status = unit.statuses.find((item) => item.id === "element:necrosis-burst")
      if (!status) return
      status.pulse += 1
      if (status.pulse % second !== 0) return
      strike(ctx, unit.elementCredit, unitId, "necrosis", ELEMENT.necrosis.dps, "true")
    },
  })
  registry.registerElement({
    id: "necrosis",
    cap: ELEMENT_GAUGE_MAX,
    resistance: 0,
    onBurst(unitId, ctx) {
      arm(ctx, unitId, "element:necrosis-burst", ELEMENT.necrosis.duration)
    },
  })
}

function gaugeCap(unit: UnitState, cap: number): number {
  const marked = unit.base.gaugeMax
  if (marked !== undefined) return marked
  return cap
}

function secondsToTicks(seconds: number): number {
  return Math.max(0, Math.round(seconds / TICK))
}

function damageKind(type: string): string {
  if (type === "phys") return "physical"
  return type
}
