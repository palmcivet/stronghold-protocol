import type { BattleEvent } from "#contract/event.js"
import type { PhaseSlot } from "#contract/phase.js"
import type { TileCoord, TileSpec, UnitSide, UnitSpec } from "#contract/spec.js"
import type {
  AttributeModifier,
  ContentContext,
  DamageInfo,
  DamagePreview,
  EventRevision,
  HitShape,
  ProjectileLaunch,
  TimerView,
  UnitView,
} from "#port/content.js"
import type { BattleRegistry } from "#battle/registry.js"
import { applyShift } from "#battle/behavior/action.js"
import { healUnit, loseLife, runDamage } from "#battle/damage/index.js"
import { addCost, costOf, spendCost } from "#battle/cost.js"
import { launchProjectile as storeProjectile, projectileViews } from "#battle/projectile/index.js"
import { bindSession } from "#battle/session.js"
import { addUnit, emit as publish, requireUnit, type BattleState } from "#battle/state.js"
import { activateSkill, configureSkill as writeSkill, gainSkillSp, readySkill as fillSkill } from "#battle/skill/point.js"
import { shouldCast as askTrigger } from "#battle/skill/trigger.js"
import { bodyRect, normHitArea } from "#battle/space/body/index.js"
import { TICK } from "#kernel/tick/index.js"
import { attributeOf, maxHpOf } from "#battle/unit/attribute.js"
import type { FieldGrid } from "#battle/space/grid/index.js"
import { selectUnits, unitsInRange as rangeUnits } from "#battle/target/selector.js"
import { addElement as chargeElement } from "#battle/unit/element.js"
import { applyStatus as giveStatus } from "#battle/unit/status/index.js"
import {
  advanceStartedTimers as advanceSlotTimers,
  advanceTimer as stepTimer,
  armListedTimers,
  startTimer as beginTimer,
  timerView as readTimerView,
} from "#battle/unit/timer.js"

export function createContext(state: BattleState, registry: BattleRegistry, tiles: FieldGrid): ContentContext {
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
    subscribe(type, handler) {
      const list = state.subscribers.get(type) ?? []
      list.push(handler)
      state.subscribers.set(type, list)
      return () => {
        const current = state.subscribers.get(type)
        if (!current) return
        const index = current.indexOf(handler)
        if (index >= 0) current.splice(index, 1)
      }
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
      addUnit(state, spec, true)
      armListedTimers(state, registry, requireUnit(state, spec.id))
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
      state.grid.setObstacle(x, y, on, kind)
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
      return selectUnits(registry, ctx, selectorId, unitIds)
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
    moduleData(moduleId, unitId) {
      const unit = requireUnit(state, unitId)
      const existing = unit.moduleData.get(moduleId)
      if (existing) return existing
      const created: Record<string, unknown> = {}
      unit.moduleData.set(moduleId, created)
      return created
    },
    schedule(tick, run) {
      state.scheduled.push({ tick, run })
    },
    finish(winner: UnitSide) {
      state.result = { finished: true, winner }
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
      return tiles.at(x, y)
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
        tags: unit.tags,
        facing: unit.facing,
        motion: unit.motion,
        flags: [...unit.flags],
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
    shared(moduleId) {
      const existing = state.shared.get(moduleId)
      if (existing) return existing
      const created: Record<string, unknown> = {}
      state.shared.set(moduleId, created)
      return created
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
  state.live = ctx
  bindSession(ctx, state, registry)
  return ctx
}

const EMPTY_SCRIPT: Readonly<Record<string, string | number | boolean>> = Object.freeze({})
const EMPTY_FIELD: Readonly<Record<string, unknown>> = Object.freeze({})

function stands(
  state: BattleState,
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
