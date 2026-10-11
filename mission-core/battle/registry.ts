import { createOrderedTable, createTable } from "#kernel/registry/index.js"
import { PHASE_SLOTS } from "#contract/phase.js"
import { arrangeConstrained, byPriority, requireSlot, slotIndex } from "#kernel/schedule/index.js"
import { createTagCatalog } from "#kernel/world/tag.js"
import type {
  BattleRegistry,
  DamageStepDefinition,
  DeployStrategyDefinition,
  ElementDefinition,
  PhaseSystem,
  SelectorDefinition,
  ShiftDefinition,
  SkillBodyDefinition,
  SkillTriggerDefinition,
  StatusDefinition,
  TimerDefinition,
} from "#port/definition.js"

export function createRegistry(): BattleRegistry {
  const statuses = createTable<StatusDefinition>("status")
  const elements = createTable<ElementDefinition>("element")
  const selectors = createTable<SelectorDefinition>("selector")
  const triggers = createTable<SkillTriggerDefinition>("skill-trigger")
  const bodies = createTable<SkillBodyDefinition>("skill-body")
  const timers = createOrderedTable<TimerDefinition>("timer")
  const strategies = createTable<DeployStrategyDefinition>("deploy")
  const shifts = createTable<ShiftDefinition>("shift")
  const steps = createOrderedTable<DamageStepDefinition>("damage-step", { compare: byPriority })
  const systems = createOrderedTable<PhaseSystem>("system", { compare: byPriority, unique: true })
  const tags = createTagCatalog()
  const timersIn = slotIndex(timers)
  const systemsIn = slotIndex(systems, (items) => arrangeConstrained(items, "system"))

  return {
    registerStatus: (definition) => statuses.register(definition),
    requireStatus: (id) => statuses.require(id),
    registerDamageStep: (definition) => steps.register(definition),
    damageSteps: () => steps.ordered(),
    registerElement: (definition) => elements.register(definition),
    requireElement: (id) => elements.require(id),
    registerSelector: (definition) => selectors.register(definition),
    requireSelector: (id) => selectors.require(id),
    registerSkillTrigger: (definition) => triggers.register(definition),
    requireSkillTrigger: (id) => triggers.require(id),
    hasSkillTrigger: (id) => triggers.has(id),
    registerSkillBody: (definition) => bodies.register(definition),
    requireSkillBody: (id) => bodies.require(id),
    hasSkillBody: (id) => bodies.has(id),
    registerTimer(definition) {
      requireSlot(definition.slot)
      timers.register(definition)
    },
    requireTimer: (id) => timers.require(id),
    timersInSlot: timersIn,
    registerDeployStrategy: (definition) => strategies.register(definition),
    requireDeployStrategy: (id) => strategies.require(id),
    registerShift: (definition) => shifts.register(definition),
    requireShift: (id) => shifts.require(id),
    registerSystem(system) {
      requireSlot(system.slot)
      systems.register(system)
    },
    systemsIn,
    systemOrder: () => PHASE_SLOTS.flatMap((slot) => systemsIn(slot).map((system) => ({ slot, id: system.id }))),
    registerTag: (key) => tags.register(key),
    requireTag: (id, owner) => tags.require(id, owner),
  }
}
