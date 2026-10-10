import type { BattleEvent } from "#contract/event.js"
import type { PhaseSlot } from "#contract/phase.js"
import type { BattleResult } from "#contract/result.js"
import type { TileCoord, TileSpec, UnitSide, UnitSpec } from "#contract/spec.js"
import type { AttributeModifier, DamageInfo, DamagePreview, ProjectileLaunch } from "#port/definition.js"
import type { ContentContext, EventRevision, HitShape, UnitView } from "#port/context.js"
import type { TimerView } from "#kernel/timer/index.js"
import type { BattleRegistry } from "#port/definition.js"
import { applyShift } from "#field/motion/index.js"
import { healUnit, loseLife, runDamage } from "#combat/damage/index.js"
import { addCost, costOf, spendCost } from "#economy/index.js"
import { launchProjectile as storeProjectile, projectileViews } from "#combat/projectile/index.js"
import { SCHEDULE } from "#battle/step.js"
import {
  ENGINE,
  grantedTagIds,
  placeUnit,
  requireUnit,
  specTagIds,
  type BattleWorld,
} from "#unit/record/index.js"
import { emit as publish, subscribe } from "#kernel/event/index.js"
import { defineResource } from "#kernel/world/resource.js"
import { grantTag, hasTag, revokeTag, tagSources } from "#kernel/world/tag.js"
import { gridOf } from "#field/grid/index.js"
import { activateSkill, configureSkill as writeSkill, gainSkillSp, readySkill as fillSkill } from "#ability/skill/point.js"
import { shouldCast as askTrigger } from "#ability/skill/trigger.js"
import { bodyRect, normHitArea } from "#field/body/index.js"
import { TICK } from "#kernel/tick/index.js"
import { attributeOf, maxHpOf } from "#ability/effect/attribute.js"
import { selectUnits, unitsInRange as rangeUnits } from "#combat/target/selector.js"
import { addElement as chargeElement } from "#combat/element/index.js"
import { applyStatus as giveStatus } from "#ability/effect/index.js"
import {
  advanceStartedTimers as advanceSlotTimers,
  advanceTimer as stepTimer,
  armListedTimers,
  startTimer as beginTimer,
  timerView as readTimerView,
} from "#unit/record/timer.js"

/** 本场结果。finish 写上胜方。 */
export const RESULT = defineResource<BattleResult>("battle:result", () => ({ finished: false, winner: null }))

export function createContext(state: BattleWorld, registry: BattleRegistry): ContentContext {
  const ctx: ContentContext = {
    registerStatus(definition) {
      registry.registerStatus(definition)
    },
    registerDamageStep(definition) {
      registry.registerDamageStep(definition)
    },
    registerElement(definition) {
      registry.registerElement(definition)
    },
    registerSelector(definition) {
      registry.registerSelector(definition)
    },
    registerSkillTrigger(definition) {
      registry.registerSkillTrigger(definition)
    },
    registerSkillBody(definition) {
      registry.registerSkillBody(definition)
    },
    registerTimer(definition) {
      registry.registerTimer(definition)
    },
    registerDeployStrategy(definition) {
      registry.registerDeployStrategy(definition)
    },
    registerShift(definition) {
      registry.registerShift(definition)
    },
    registerSystem(system) {
      registry.registerSystem(system)
    },
    registerTag(key) {
      registry.registerTag(key)
    },
    subscribe(type, handler) {
      return subscribe(state.events, type, (event) => handler(event, ctx))
    },
    dealDamage(info: DamageInfo) {
      runDamage(state, registry, ctx, info, false)
    },
    heal(unitId, amount, options) {
      healUnit(state, registry, ctx, unitId, amount, options)
    },
    loseHp(unitId, amount) {
      loseLife(state, registry, ctx, unitId, amount)
    },
    applyStatus(unitId, statusId, application) {
      giveStatus(state, registry, ctx, unitId, statusId, application)
    },
    spawnUnit(spec: UnitSpec) {
      if (!stands(state, registry, ctx, spec.id, spec.x, spec.y)) return
      armListedTimers(state, registry, placeUnit(state, registry, spec, true))
      publish(state, "spawn", { unitId: spec.id })
    },
    displace(unitId, x, y) {
      if (!stands(state, registry, ctx, unitId, x, y)) return
      const unit = requireUnit(state, unitId)
      unit.x = x
      unit.y = y
      if (unit.route) unit.route.pts = null
      publish(state, "displace", { unitId, x, y })
    },
    shift(actionId, unitId, input) {
      return applyShift(state, registry, ctx, actionId, unitId, input)
    },
    setObstacle(x, y, on, kind) {
      gridOf(state).setObstacle(x, y, on, kind)
    },
    launchProjectile(projectile: ProjectileLaunch) {
      storeProjectile(state, projectile)
      publish(state, "projectile", {
        id: projectile.id,
        sourceId: projectile.sourceId,
        targetId: projectile.targetId,
      })
    },
    spendCost(side, amount) {
      return spendCost(state, side, amount)
    },
    addCost(side, amount) {
      addCost(state, side, amount)
    },
    costOf(side) {
      return costOf(state, side)
    },
    emit(type, data) {
      publish(state, type, data)
    },
    random: state.random,
    hitRect(unitId): HitShape {
      const unit = requireUnit(state, unitId)
      const area = normHitArea(unit.hitArea)
      const rect = bodyRect(unit)
      if (!area || !rect) {
        return { kind: "tile", x: Math.round(unit.x) - 0.5, y: Math.round(unit.y) - 0.5, w: 1, h: 1 }
      }
      return { kind: "rect", x: rect.x0, y: rect.y0, w: area.w, h: area.h }
    },
    unitsInRange(unitId, selectorId) {
      return rangeUnits(state, registry, ctx, unitId, selectorId)
    },
    select(selectorId, unitIds) {
      return selectUnits(registry, ctx, selectorId, unitIds, { origin: null })
    },
    previewDamage(info: DamageInfo): DamagePreview {
      return runDamage(state, registry, ctx, info, true)
    },
    startTimer(unitId, timerId) {
      beginTimer(state, registry, unitId, timerId)
    },
    advanceTimer(unitId, timerId) {
      stepTimer(state, registry, ctx, unitId, timerId)
    },
    advanceStartedTimers(slot: PhaseSlot) {
      advanceSlotTimers(state, registry, ctx, slot)
    },
    timerView(unitId, timerId): TimerView {
      return readTimerView(state, registry, unitId, timerId)
    },
    addElement(unitId, elementId, amount) {
      chargeElement(state, registry, ctx, unitId, elementId, amount)
    },
    component(key) {
      return state.components.access(key)
    },
    resource(key) {
      return state.resources.access(key)
    },
    hasTag(unitId, key) {
      const unit = state.units.get(unitId)
      return unit !== undefined && hasTag(unit, key)
    },
    grantTag(unitId, key, sourceId) {
      registry.requireTag(key.id, `grant from ${sourceId}`)
      grantTag(requireUnit(state, unitId), key, sourceId)
    },
    revokeTag(unitId, key, sourceId) {
      const unit = state.units.get(unitId)
      if (unit) revokeTag(unit, key, sourceId)
    },
    tagSources(unitId, key) {
      const unit = state.units.get(unitId)
      return unit ? tagSources(unit, key) : []
    },
    schedule(tick, run) {
      state.resources.access(SCHEDULE).ensure().push({ tick, run })
    },
    finish(winner: UnitSide) {
      state.resources.access(RESULT).set({ finished: true, winner })
    },
    tick() {
      return state.tick
    },
    shouldCast(unitId, skillId) {
      return askTrigger(state, registry, ctx, unitId, skillId)
    },
    castSkill(unitId, skillId) {
      return activateSkill(state, registry, ctx, unitId, skillId, "manual")
    },
    readySkill(unitId, skillId) {
      fillSkill(state, unitId, skillId)
    },
    configureSkill(unitId, skillId, spec) {
      writeSkill(state, unitId, skillId, spec)
    },
    setAim(unitId, priority) {
      const unit = state.units.get(unitId)
      if (!unit) return
      const aim = unit as { targetPriority: string }
      aim.targetPriority = priority
    },
    gainSp(unitId, skillId, amount) {
      return gainSkillSp(state, unitId, skillId, amount, "grant")
    },
    tile(x, y): TileSpec | null {
      return gridOf(state).at(x, y)
    },
    projectiles() {
      return projectileViews(state)
    },
    unit(unitId): UnitView | null {
      const unit = state.units.get(unitId)
      if (!unit) return null
      const hp = unit.attributes.hp ?? 0
      return {
        id: unit.id,
        side: unit.side,
        x: unit.x,
        y: unit.y,
        hp,
        maxHp: maxHpOf(unit, registry),
        alive: unit.fielded && !unit.downed && hp > 0 && !unit.routeHidden,
        fielded: unit.fielded,
        downed: unit.downed,
        tags: specTagIds(unit),
        facing: unit.facing,
        motion: unit.motion,
        flags: grantedTagIds(unit),
      }
    },
    units(side) {
      const ids: string[] = []
      for (const unit of state.units.values()) {
        if (side !== undefined && unit.side !== side) continue
        ids.push(unit.id)
      }
      return ids
    },
    attribute(unitId, key) {
      const unit = state.units.get(unitId)
      if (!unit) return 0
      if (key === "hp") return unit.attributes.hp ?? 0
      if (key === "maxHp") return maxHpOf(unit, registry)
      return attributeOf(unit, registry, key)
    },
    setModifier(unitId, key, modifiers, duration) {
      const unit = state.units.get(unitId)
      if (!unit) return
      if (duration !== undefined && !(duration > 0)) {
        unit.modifiers.delete(key)
        return
      }
      const remaining = duration === undefined ? Number.POSITIVE_INFINITY : Math.max(1, Math.round(duration / TICK))
      const copy: AttributeModifier[] = modifiers.map((modifier) => ({
        attribute: modifier.attribute,
        op: modifier.op,
        value: modifier.value,
      }))
      unit.modifiers.set(key, { modifiers: copy, remaining })
    },
    clearModifier(unitId, key) {
      state.units.get(unitId)?.modifiers.delete(key)
    },
    hasModifier(unitId, key) {
      const timed = state.units.get(unitId)?.modifiers.get(key)
      return timed !== undefined && timed.remaining > 0
    },
    script(unitId) {
      return state.units.get(unitId)?.script ?? EMPTY_SCRIPT
    },
    field() {
      return state.spec.notes ?? EMPTY_FIELD
    },

    revise(event: BattleEvent, revision: EventRevision) {
      const data = event.data as Record<string, unknown>
      if (revision.prevented !== undefined) data.prevented = revision.prevented
      if (revision.cancel !== undefined) data.cancel = revision.cancel
      if (revision.amount !== undefined) data.amount = revision.amount
      if (revision.mul !== undefined) data.mul = revision.mul
      if (revision.kind !== undefined) data.kind = revision.kind
    },
  }
  state.resources.access(ENGINE).set({ world: state, registry })
  return ctx
}

const EMPTY_SCRIPT: Readonly<Record<string, string | number | boolean>> = Object.freeze({})
const EMPTY_FIELD: Readonly<Record<string, unknown>> = Object.freeze({})

function stands(
  state: BattleWorld,
  registry: BattleRegistry,
  ctx: ContentContext,
  unitId: string,
  x: number,
  y: number,
): boolean {
  const strategyId = state.spec.deployStrategy
  if (strategyId === null) return true
  const tile: TileCoord = { x: Math.round(x), y: Math.round(y) }
  return registry.requireDeployStrategy(strategyId).canStand(unitId, tile, ctx)
}
