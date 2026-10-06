import type { PhaseSlot } from "#contract/phase.js"
import type { TileSpec, UnitSide, UnitSpec } from "#contract/spec.js"
import type {
  ContentContext,
  DamageInfo,
  DamagePreview,
  HitShape,
  ProjectileLaunch,
  TimerView,
} from "#port/content.js"
import type { BattleRegistry } from "#battle/registry.js"
import { healUnit, loseLife, runDamage } from "#battle/damage/index.js"
import { launchProjectile as storeProjectile } from "#battle/projectile/index.js"
import { addUnit, emit as publish, requireUnit, type BattleState } from "#battle/state.js"
import { activateSkill, gainSkillSp } from "#battle/skill/point.js"
import { shouldCast as askTrigger } from "#battle/skill/trigger.js"
import { bodyRect, normHitArea } from "#battle/space/body/index.js"
import type { FieldGrid } from "#battle/space/grid/index.js"
import { selectUnits, unitsInRange as rangeUnits } from "#battle/target/selector.js"
import { addElement as chargeElement } from "#battle/unit/element.js"
import { applyStatus as giveStatus } from "#battle/unit/status/index.js"
import {
  advanceStartedTimers as advanceSlotTimers,
  advanceTimer as stepTimer,
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
      healUnit(state, registry, unitId, amount, options)
    },
    loseHp(unitId, amount) {
      loseLife(state, registry, ctx, unitId, amount)
    },
    applyStatus(unitId, statusId, application) {
      giveStatus(state, registry, ctx, unitId, statusId, application)
    },
    spawnUnit(spec: UnitSpec) {
      addUnit(state, spec, true)
      publish(state, "spawn", { unitId: spec.id })
    },
    displace(unitId, x, y) {
      const unit = requireUnit(state, unitId)
      unit.x = x
      unit.y = y
      if (unit.route) unit.route.pts = null
      publish(state, "displace", { unitId, x, y })
    },
    launchProjectile(projectile: ProjectileLaunch) {
      storeProjectile(state, projectile)
      publish(state, "projectile", {
        id: projectile.id,
        sourceId: projectile.sourceId,
        targetId: projectile.targetId,
      })
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
      activateSkill(state, registry, ctx, unitId, skillId, "manual")
    },
    gainSp(unitId, skillId, amount) {
      return gainSkillSp(state, unitId, skillId, amount, "grant")
    },
    tile(x, y): TileSpec | null {
      return tiles.at(x, y)
    },
    projectiles() {
      return state.projectiles.map((projectile) => ({ ...projectile }))
    },
  }
    return ctx
}
