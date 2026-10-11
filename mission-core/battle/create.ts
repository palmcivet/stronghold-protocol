import { PHASE_SLOTS } from "#contract/phase.js"
import type { BattleEvent } from "#contract/event.js"
import type { BattleLedger, BattleResult } from "#contract/result.js"
import type { BattleSnapshot } from "#contract/snapshot.js"
import type { BattleSpec, UnitSpec } from "#contract/spec.js"
import type { MissionModule, Registration } from "#port/module.js"
import type { BattleRegistry, SystemOrderEntry } from "#port/definition.js"
import { CORE_TAGS } from "#port/tag.js"
import { UnknownRegistrationError } from "#kernel/registry/error.js"
import { drainEvents, emit } from "#kernel/event/index.js"
import { counterTimer, elapsedTimer } from "#kernel/timer/index.js"
import { createWorld } from "#kernel/world/index.js"
import { exportWorld, importWorld, type WorldArchive } from "#kernel/world/archive.js"
import { registerBuiltinShifts } from "#field/motion/index.js"

import { RESULT, createContext } from "#battle/context.js"
import { registerEngineSystems } from "#battle/step.js"
import { createRegistry } from "#battle/registry.js"
import { readSnapshot } from "#battle/snapshot.js"
import { openBattle } from "#unit/deploy/strategy.js"
import { normalizeTrigger } from "#ability/skill/constants.js"
import { registerBuiltinSkillBodies } from "#ability/skill/body.js"
import { armField, bindSkillSignals, registerSkillTimers } from "#ability/skill/point.js"
import { registerBuiltinSkillTriggers } from "#ability/skill/trigger.js"
import { addUnit, checkSpecTags, grantSpecTags, markDeployed, type BattleWorld, type UnitState } from "#unit/record/index.js"
import { armListedTimers } from "#unit/record/timer.js"
import { unitCodec } from "#unit/record/archive.js"
import { bindLedger, readLedger } from "#ledger/index.js"
import { registerDamageSteps } from "#combat/damage/index.js"
import { registerBuiltinElements } from "#combat/element/index.js"
import { registerAttackTimers } from "#combat/attack/index.js"
import { bindIndependentTimers } from "#combat/attack/timing.js"
import { registerStatusCatalog } from "#ability/effect/catalog.js"
import { registerStatusTimer } from "#ability/effect/index.js"
import { registerBuiltinSelectors } from "#combat/target/catalog.js"

export interface Battle {
  /** 推进一拍。推进中（系统或订阅者里）再调用会报错，保证每拍的顺序确定。 */
  step(): void
  snapshot(): BattleSnapshot
  drainEvents(): readonly BattleEvent[]
  result(): BattleResult
  /** 按单位 owner 记的账。 */
  ledger(): BattleLedger
  /** 全部系统的执行顺序。 */
  systemOrder(): readonly SystemOrderEntry[]
  /** 世界的纯数据快照。用同样的规格与模块调用 createBattle(spec, modules, archive) 从这里继续。 */
  export(): WorldArchive
}

/** 建一场战斗。给了 archive 时先照常建好，再把世界换成 archive 的状态，待取走的事件清空。 */
export function createBattle(spec: BattleSpec, modules: readonly MissionModule[], archive?: WorldArchive): Battle {
  const state = createState(spec)
  const registry = createRegistry()
  for (const key of CORE_TAGS) registry.registerTag(key)
  registerBuiltinSkillBodies(registry)
  registerBuiltinSkillTriggers(state, registry)
  registerBuiltinSelectors(state, registry)
  registerSkillTimers(registry, state)
  registry.registerTimer(counterTimer("trait", "ally", "count"))
  registry.registerTimer(elapsedTimer("redeploy", "redeploy"))
  registerAttackTimers(registry, state)
  registerStatusTimer(registry, state)
  registerStatusCatalog(state, registry)
  registerBuiltinElements(state, registry)
  registerDamageSteps(state, registry)
  const ctx = createContext(state, registry)
  registerBuiltinShifts(registry)
  registerEngineSystems(registry, state)
  installModules(spec, modules, ctx)
  registry.systemOrder()
  validateUnits(spec, registry)
  for (const unit of spec.units) grantSpecTags(registry, requireSpecUnit(state, unit), unit)
  if (spec.deployStrategy !== null) registry.requireDeployStrategy(spec.deployStrategy)
  bindSkillSignals(state, registry, ctx)
  for (const unit of state.units.values()) armListedTimers(state, registry, unit)
  bindIndependentTimers(state, registry, ctx)
  bindLedger(state, ctx)
  openBattle(state, registry, ctx)
  if (spec.deployStrategy === null) {
    for (const unit of state.units.values()) {
      if (!unit.fielded) continue
      markDeployed(unit)
      emit(state, "deploy", { unitId: unit.id })
    }
  }
  armField(state, registry, ctx, true)
  const result = state.resources.access(RESULT)
  const units = unitCodec(spec, registry)
  if (archive) importWorld(state, archive, units)
  let stepping = false
  return {
    step() {
      if (stepping) throw new Error("step called while the battle is stepping")
      stepping = true
      try {
        for (const slot of PHASE_SLOTS) {
          for (const system of registry.systemsIn(slot)) system.run(ctx)
        }
        state.tick += 1
      } finally {
        stepping = false
      }
    },
    snapshot() {
      return readSnapshot(state, registry)
    },
    drainEvents() {
      return drainEvents(state.events)
    },
    result() {
      const current = result.ensure()
      return { finished: current.finished, winner: current.winner }
    },
    ledger() {
      return readLedger(state)
    },
    systemOrder() {
      return registry.systemOrder()
    },
    export() {
      return exportWorld(state, units)
    },
  }
}

/** 建出世界，放入开场单位。规格标签等模块装好后再授予。 */
function createState(spec: BattleSpec): BattleWorld {
  const state: BattleWorld = createWorld(spec)
  const fielded = spec.deployStrategy === null
  for (const unit of spec.units) addUnit(state, unit, fielded)
  return state
}

function requireSpecUnit(state: BattleWorld, spec: UnitSpec): UnitState {
  const unit = state.units.get(spec.id)
  if (!unit) throw new Error(`单位不存在: ${spec.id}`)
  return unit
}

function installModules(spec: BattleSpec, modules: readonly MissionModule[], ctx: Registration): void {
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

/** 开场与出场单位的技能体、技能触发和标签都要已注册。 */
function validateUnits(spec: BattleSpec, registry: BattleRegistry): void {
  const units: UnitSpec[] = [...spec.units, ...spec.spawns.map((spawn) => spawn.unit)]
  for (const unit of units) {
    for (const skill of unit.skills) {
      if (!registry.hasSkillBody(skill.body)) throw new UnknownRegistrationError("skill-body", skill.body)
      const trigger = normalizeTrigger(skill.trigger)
      if (!registry.hasSkillTrigger(trigger)) throw new UnknownRegistrationError("skill-trigger", trigger)
    }
    checkSpecTags(registry, unit)
  }
}
