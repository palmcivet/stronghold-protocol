import { PHASE_SLOTS } from "#contract/phase.js"
import type { BattleEvent } from "#contract/event.js"
import type { BattleResult } from "#contract/result.js"
import type { BattleSnapshot } from "#contract/snapshot.js"
import type { BattleSpec, UnitSpec } from "#contract/spec.js"
import type { MissionModule } from "#port/content.js"
import { UnknownRegistrationError } from "#kernel/registry/error.js"
import { createRandom } from "#kernel/random/index.js"
import { registerBuiltinShifts } from "#field/motion/index.js"
import { createContext } from "#battle/context.js"
import { registerEngineSystems } from "#battle/step.js"
import { createRegistry, type BattleRegistry } from "#kernel/registry/index.js"
import { readSnapshot } from "#battle/snapshot.js"
import { createGrid, type GridPoint } from "#field/grid/index.js"
import { openBattle } from "#unit/deploy/strategy.js"
import { normalizeTrigger } from "#ability/skill/constants.js"
import { registerBuiltinSkillBodies } from "#ability/skill/body.js"
import { armField, bindSkillSignals } from "#ability/skill/point.js"
import { registerBuiltinSkillTriggers } from "#ability/skill/trigger.js"
import { initialCost } from "#economy/index.js"
import { addUnit, emit, type BattleState } from "#battle/state.js"
import { registerDamageSteps } from "#combat/damage/index.js"
import { registerBuiltinElements } from "#combat/element/index.js"
import { registerStatusCatalog } from "#ability/effect/catalog.js"
import { registerStatusTimer } from "#ability/effect/index.js"
import { registerBuiltinSelectors } from "#combat/target/catalog.js"
import { armListedTimers, bindIndependentTimers, registerBuiltinTimers } from "#kernel/timer/index.js"

export interface Battle {
  step(): void
  snapshot(): BattleSnapshot
  drainEvents(): readonly BattleEvent[]
  result(): BattleResult
}

export function createBattle(spec: BattleSpec, modules: readonly MissionModule[]): Battle {
  const grid = createGrid(spec.tiles, spanPoints(spec))
  const state = createState(spec, grid)
  const registry = createRegistry()
  registerBuiltinSkillBodies(registry)
  registerBuiltinSkillTriggers(state, registry)
  registerBuiltinSelectors(state, registry)
  registerBuiltinTimers(registry, state)
  registerStatusTimer(registry, state)
  registerStatusCatalog(state, registry)
  registerBuiltinElements(state, registry)
  registerDamageSteps(state, registry)
  const ctx = createContext(state, registry, grid)
  registerBuiltinShifts(registry)
  registerEngineSystems(registry, state)
  installModules(spec, modules, ctx)
  validateSkills(spec, registry)
  if (spec.deployStrategy !== null) registry.requireDeployStrategy(spec.deployStrategy)
  bindSkillSignals(state, registry, ctx)
  for (const unit of state.units.values()) armListedTimers(state, registry, unit)
  bindIndependentTimers(state, registry, ctx)
  openBattle(state, registry, ctx)
  if (spec.deployStrategy === null) {
    for (const unit of state.units.values()) {
      if (unit.fielded) emit(state, "deploy", { unitId: unit.id })
    }
  }
  armField(state, registry, ctx, true)
  return {
    step() {
      for (const slot of PHASE_SLOTS) {
        for (const system of registry.systemsIn(slot)) system.run(ctx)
      }
      state.tick += 1
    },
    snapshot() {
      return readSnapshot(state.tick, state.units.values())
    },
    drainEvents() {
      const events = state.events.slice()
      state.events.length = 0
      return events
    },
    result() {
      return { finished: state.result.finished, winner: state.result.winner }
    },
  }
}

function spanPoints(spec: BattleSpec): GridPoint[] {
  const points: GridPoint[] = []
  for (const unit of spec.units) points.push({ x: unit.x, y: unit.y })
  for (const spawn of spec.spawns) points.push({ x: spawn.unit.x, y: spawn.unit.y })
  return points
}

function createState(spec: BattleSpec, grid: ReturnType<typeof createGrid>): BattleState {
  const state: BattleState = {
    spec,
    grid,
    tick: 0,
    units: new Map(),
    spawned: new Set(),
    projectiles: [],
    cost: {
      ally: initialCost(spec.cost.ally),
      enemy: initialCost(spec.cost.enemy),
    },
    events: [],
    subscribers: new Map(),
    scheduled: [],
    result: { finished: false, winner: null },
    random: createRandom(spec.seed),
    damagePreview: false,
    selectorOrigin: null,
    shared: new Map(),
    live: null,
  }
  const fielded = spec.deployStrategy === null
  for (const unit of spec.units) addUnit(state, unit, fielded)
  return state
}

function installModules(spec: BattleSpec, modules: readonly MissionModule[], ctx: Parameters<MissionModule["install"]>[0]): void {
  const catalog = new Map<string, MissionModule>()
  for (const module of modules) {
    if (catalog.has(module.id)) throw new Error(`模块重复: ${module.id}`)
    catalog.set(module.id, module)
  }
  const selected = new Set(spec.modules)
  for (const id of spec.modules) {
    if (!catalog.has(id)) throw new UnknownRegistrationError("module", id)
  }
  const ordered: MissionModule[] = []
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (id: string): void => {
    if (visited.has(id)) return
    if (visiting.has(id)) throw new Error(`模块循环: ${id}`)
    const module = catalog.get(id)
    if (!module) throw new UnknownRegistrationError("module", id)
    visiting.add(id)
    for (const dependency of module.dependsOn ?? []) {
      if (!selected.has(dependency)) throw new UnknownRegistrationError("module", dependency)
      visit(dependency)
    }
    visiting.delete(id)
    visited.add(id)
    ordered.push(module)
  }
  for (const id of spec.modules) visit(id)
  for (const module of ordered) module.install(ctx)
}

function validateSkills(spec: BattleSpec, registry: BattleRegistry): void {
  const units: UnitSpec[] = [...spec.units, ...spec.spawns.map((spawn) => spawn.unit)]
  for (const unit of units) {
    for (const skill of unit.skills) {
      if (!registry.hasSkillBody(skill.body)) throw new UnknownRegistrationError("skill-body", skill.body)
      const trigger = normalizeTrigger(skill.trigger)
      if (!registry.hasSkillTrigger(trigger)) throw new UnknownRegistrationError("skill-trigger", trigger)
    }
  }
}
