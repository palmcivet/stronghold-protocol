import type { BattleRegistry } from "#battle/registry.js"
import { advanceShift } from "#battle/behavior/action.js"
import { advanceProjectiles } from "#battle/projectile/index.js"
import { armUnit } from "#battle/skill/point.js"
import { attributeOf } from "#battle/unit/attribute.js"
import { clearAttackTargetThisTick } from "#battle/unit/clock.js"
import { MOVE_SCALE, advanceRoute } from "#battle/space/grid/route.js"
import { addUnit, emit, readTimer, requireUnit, type BattleState, type ScheduledCallback } from "#battle/state.js"
import { advanceStartedTimers, advanceTimer, armListedTimers } from "#battle/unit/timer.js"
import { TICK } from "#kernel/tick/index.js"

export function registerEngineSystems(registry: BattleRegistry, state: BattleState): void {
  registry.registerSystem({
    id: "engine:schedule",
    slot: "schedule",
    priority: 0,
    run(runCtx) {
      const due: ScheduledCallback[] = []
      for (let index = state.scheduled.length - 1; index >= 0; index -= 1) {
        const callback = state.scheduled[index]
        if (!callback || callback.tick !== state.tick) continue
        due.push(callback)
        state.scheduled.splice(index, 1)
      }
      due.reverse()
      for (const callback of due) callback.run(runCtx)
    },
  })
  registry.registerSystem({
    id: "engine:spawn",
    slot: "spawn",
    priority: 0,
    run(runCtx) {
      state.spec.spawns.forEach((spawn, index) => {
        if (spawn.atTick !== state.tick || state.spawned.has(index)) return
        state.spawned.add(index)
        addUnit(state, spawn.unit, true)
        const spawned = requireUnit(state, spawn.unit.id)
        armUnit(state, registry, runCtx, spawned, false)
        armListedTimers(state, registry, spawned)
        emit(state, "spawn", { unitId: spawn.unit.id })
      })
    },
  })
  registry.registerSystem({
    id: "engine:enemy-route",
    slot: "enemy",
    priority: 0,
    run() {
      for (const unit of state.units.values()) {
        if (advanceShift(state, registry, unit, TICK)) continue
        const speed = Math.max(0, attributeOf(unit, registry, "moveSpeed")) * MOVE_SCALE
        advanceRoute(state.grid, unit, TICK, speed)
      }
    },
  })
  registry.registerSystem({
    id: "engine:enemy-attack",
    slot: "enemy",
    priority: 1,
    run(runCtx) {
      for (const unit of state.units.values()) {
        if (unit.side !== "enemy" || !unit.fielded || unit.downed) continue
        if (readTimer(unit, "attack")) advanceTimer(state, registry, runCtx, unit.id, "attack")
        clearAttackTargetThisTick(unit)
      }
    },
  })
  registry.registerSystem({
    id: "engine:status-timers",
    slot: "status",
    priority: 0,
    run(runCtx) {
      advanceStartedTimers(state, registry, runCtx, "status")
    },
  })
  registry.registerSystem({
    id: "engine:projectile",
    slot: "projectile",
    priority: 0,
    run(runCtx) {
      advanceProjectiles(state, registry, runCtx)
    },
  })
  registry.registerSystem({
    id: "engine:ally-timers",
    slot: "ally",
    priority: 0,
    run(runCtx) {
      advanceStartedTimers(state, registry, runCtx, "ally")
      for (const unit of state.units.values()) {
        if (unit.side !== "ally" || !unit.fielded || unit.downed) continue
        clearAttackTargetThisTick(unit)
      }
    },
  })
  registry.registerSystem({
    id: "engine:modifiers",
    slot: "finale",
    priority: 1000,
    run() {
      for (const unit of state.units.values()) {
        for (const [key, timed] of unit.modifiers) {
          if (timed.remaining === Infinity) continue
          timed.remaining -= 1
          if (timed.remaining <= 0) unit.modifiers.delete(key)
        }
      }
    },
  })
}
