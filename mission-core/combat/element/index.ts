import type { ContentContext } from "#port/context.js"
import type { BattleRegistry } from "#port/definition.js"
import { drainSkillSp } from "#ability/skill/point.js"
import { emit } from "#kernel/event/index.js"
import { requireUnit, type BattleWorld } from "#unit/record/index.js"
import { ELEMENT, ELEMENT_GAUGE_MAX } from "#combat/damage/constants.js"
import { TICK } from "#kernel/tick/index.js"
import type { UnitState } from "#unit/record/index.js"
import { hasTag } from "#kernel/world/tag.js"
import { BURST_LOCK, NO_SP, SILENCE, STUN } from "#port/tag.js"
import { gaugesOf, peekGauges } from "#combat/element/gauge.js"
import type { ComponentStore } from "#kernel/world/component.js"

export function hasHp(unit: UnitState): boolean {
  return !unit.downed && (unit.attributes.hp ?? 0) > 0
}

/** 爆发冷却结束，这个单位每种元素槽都归零。 */
export function clearElements(world: { readonly components: ComponentStore }, unitId: string): void {
  const gauges = peekGauges(world, unitId)
  if (!gauges) return
  for (const slot of gauges.slots.values()) {
    slot.value = 0
    slot.locked = false
  }
}

/** 最近一次把元素槽打满的单位。没有时是空串。 */
function creditOf(world: { readonly components: ComponentStore }, unitId: string): string {
  return peekGauges(world, unitId)?.credit ?? ""
}

export type Charge = "burst" | "filled" | "refused"

/** 把已经算好的损伤加进槽。返回值表示有没有蓄满。 */
export function chargeElement(
  state: BattleWorld,
  registry: BattleRegistry,
  unitId: string,
  elementId: string,
  amount: number,
): Charge {
  const definition = registry.requireElement(elementId)
  const unit = requireUnit(state, unitId)
  if (!hasHp(unit) || peekGauges(state, unitId)?.bursting === true || hasTag(unit, BURST_LOCK)) return "refused"
  if (!(amount > 0) || !Number.isFinite(amount)) return "refused"
  const cap = gaugeCap(unit, definition.cap)
  const slots = gaugesOf(state, unitId).slots
  const existing = slots.get(elementId)
  const slot = existing ?? { value: 0, locked: false, cap }
  if (!existing) slots.set(elementId, slot)
  if (slot.locked) return "refused"
  slot.cap = cap
  slot.value += amount
  if (slot.value < cap) return "filled"
  slot.value = cap
  slot.locked = true
  return "burst"
}

/** 蓄满后的爆发。爆发自己的伤害不再次进槽。 */
export function burstElement(
  state: BattleWorld,
  registry: BattleRegistry,
  ctx: ContentContext,
  unitId: string,
  elementId: string,
  sourceId: string,
): void {
  const definition = registry.requireElement(elementId)
  const unit = requireUnit(state, unitId)
  const gauges = gaugesOf(state, unitId)
  if (gauges.bursting || hasTag(unit, BURST_LOCK)) return
  gauges.credit = sourceId
  gauges.bursting = true
  try {
    emit(state, "elementBurst", { sourceId, targetId: unitId, element: elementId })
    definition.onBurst?.(unitId, ctx, sourceId)
  } finally {
    gauges.bursting = false
  }
}

export function addElement(
  state: BattleWorld,
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

export function registerBuiltinElements(state: BattleWorld, registry: BattleRegistry): void {
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
    tags: [BURST_LOCK],
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
    tags: [BURST_LOCK, STUN],
    modifiers: [],
    immunity: [],
    stackCap: 1,
    cancels: ["attack"],
    duration: secondsToTicks(ELEMENT.neural.ally.duration),
  })
  registry.registerStatus({
    id: "element:neural-enemy",
    tags: [BURST_LOCK],
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
    tags: [BURST_LOCK, SILENCE, NO_SP],
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
      strike(ctx, creditOf(state, unitId), unitId, "apoptosis", ELEMENT.apoptosis.ally.dps, damageKind(ELEMENT.apoptosis.ally.dpsType))
    },
  })
  registry.registerStatus({
    id: "element:apoptosis-enemy",
    tags: [BURST_LOCK],
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
      strike(ctx, creditOf(state, unitId), unitId, "apoptosis", ELEMENT.apoptosis.enemy.elemDps, "elemental")
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
    tags: [BURST_LOCK],
    modifiers: [],
    immunity: [],
    stackCap: 1,
    cancels: [],
    duration: secondsToTicks(ELEMENT.erosion.ally.duration),
  })
  registry.registerStatus({
    id: "element:erosion-down",
    tags: [],
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
    tags: [BURST_LOCK],
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
      strike(ctx, creditOf(state, unitId), unitId, "necrosis", ELEMENT.necrosis.dps, "true")
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
