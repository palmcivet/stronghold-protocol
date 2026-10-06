import type { BattleRegistry } from "#battle/registry.js"
import { armUnit } from "#battle/skill/point.js"
import { advanceRoute } from "#battle/space/grid/route.js"
import { addUnit, emit, readTimer, requireUnit, type BattleState, type ScheduledCallback } from "#battle/state.js"
import { advanceStartedTimers, advanceTimer } from "#battle/unit/timer.js"
import { TICK } from "#tick/index.js"

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
        armUnit(state, registry, runCtx, requireUnit(state, spawn.unit.id), false)
        emit(state, "spawn", { unitId: spawn.unit.id })
      })
    },
  })
  registry.registerSystem({
    id: "engine:enemy-route",
    slot: "enemy",
    priority: 0,
    run() {
      for (const unit of state.units.values()) advanceRoute(state.grid, unit, TICK)
    },
  })
  registry.registerSystem({
    id: "engine:enemy-attack",
    slot: "enemy",
    priority: 1,
    run(runCtx) {
      for (const unit of state.units.values()) {
        if (unit.side !== "enemy" || !unit.fielded || unit.downed) continue
        if (!readTimer(unit, "attack")) continue
        advanceTimer(state, registry, runCtx, unit.id, "attack")
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
    id: "engine:ally-timers",
    slot: "ally",
    priority: 0,
    run(runCtx) {
      advanceStartedTimers(state, registry, runCtx, "ally")
    },
  })
}
