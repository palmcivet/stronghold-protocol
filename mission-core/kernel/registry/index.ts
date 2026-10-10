import { isPhaseSlot, type PhaseSlot } from "#contract/phase.js"
import type {
  DamageStepDefinition,
  DeployStrategyDefinition,
  ElementDefinition,
  PhaseSystem,
  SelectorDefinition,
  SkillBodyDefinition,
  SkillTriggerDefinition,
  ShiftDefinition,
  StatusDefinition,
  TimerDefinition,
} from "#port/content.js"
import { UnknownRegistrationError } from "#kernel/registry/error.js"

interface Ordered<T> {
  readonly item: T
  readonly order: number
}

export interface BattleRegistry {
  registerStatus(definition: StatusDefinition): void
  requireStatus(id: string): StatusDefinition
  registerDamageStep(definition: DamageStepDefinition): void
  damageSteps(): readonly DamageStepDefinition[]
  registerElement(definition: ElementDefinition): void
  requireElement(id: string): ElementDefinition
  registerSelector(definition: SelectorDefinition): void
  requireSelector(id: string): SelectorDefinition
  registerSkillTrigger(definition: SkillTriggerDefinition): void
  requireSkillTrigger(id: string): SkillTriggerDefinition
  hasSkillTrigger(id: string): boolean
  registerSkillBody(definition: SkillBodyDefinition): void
  requireSkillBody(id: string): SkillBodyDefinition
  hasSkillBody(id: string): boolean
  registerTimer(definition: TimerDefinition): void
  requireTimer(id: string): TimerDefinition
  timersInSlot(slot: PhaseSlot): readonly TimerDefinition[]
  registerDeployStrategy(definition: DeployStrategyDefinition): void
  requireDeployStrategy(id: string): DeployStrategyDefinition
  registerShift(definition: ShiftDefinition): void
  requireShift(id: string): ShiftDefinition
  registerSystem(system: PhaseSystem): void
  systemsIn(slot: PhaseSlot): readonly PhaseSystem[]
}

export function createRegistry(): BattleRegistry {
  let order = 0
  const statuses = new Map<string, StatusDefinition>()
  const elements = new Map<string, ElementDefinition>()
  const selectors = new Map<string, SelectorDefinition>()
  const triggers = new Map<string, SkillTriggerDefinition>()
  const bodies = new Map<string, SkillBodyDefinition>()
  const timers = new Map<string, Ordered<TimerDefinition>>()
  const strategies = new Map<string, DeployStrategyDefinition>()
  const shifts = new Map<string, ShiftDefinition>()
  const steps: Ordered<DamageStepDefinition>[] = []
  const systems: Ordered<PhaseSystem>[] = []

  const nextOrder = (): number => {
    order += 1
    return order
  }

  return {
    registerStatus(definition) {
      statuses.set(definition.id, definition)
    },
    requireStatus(id) {
      return requireItem(statuses, "status", id)
    },
    registerDamageStep(definition) {
      const entry: Ordered<DamageStepDefinition> = { item: definition, order: nextOrder() }
      const index = steps.findIndex((step) => step.item.id === definition.id)
      if (index >= 0) steps[index] = entry
      else steps.push(entry)
    },
    damageSteps() {
      return [...steps]
        .sort((left, right) => left.item.priority - right.item.priority || left.order - right.order)
        .map((step) => step.item)
    },
    registerElement(definition) {
      elements.set(definition.id, definition)
    },
    requireElement(id) {
      return requireItem(elements, "element", id)
    },
    registerSelector(definition) {
      selectors.set(definition.id, definition)
    },
    requireSelector(id) {
      return requireItem(selectors, "selector", id)
    },
    registerSkillTrigger(definition) {
      triggers.set(definition.id, definition)
    },
    requireSkillTrigger(id) {
      return requireItem(triggers, "skill-trigger", id)
    },
    hasSkillTrigger(id) {
      return triggers.has(id)
    },
    registerSkillBody(definition) {
      bodies.set(definition.id, definition)
    },
    requireSkillBody(id) {
      return requireItem(bodies, "skill-body", id)
    },
    hasSkillBody(id) {
      return bodies.has(id)
    },
    registerTimer(definition) {
      if (!isPhaseSlot(definition.slot)) throw new UnknownRegistrationError("phase", definition.slot)
      timers.set(definition.id, { item: definition, order: nextOrder() })
    },
    requireTimer(id) {
      const timer = timers.get(id)
      if (!timer) throw new UnknownRegistrationError("timer", id)
      return timer.item
    },
    timersInSlot(slot) {
      return [...timers.values()]
        .filter((timer) => timer.item.slot === slot)
        .sort((left, right) => left.order - right.order)
        .map((timer) => timer.item)
    },
    registerDeployStrategy(definition) {
      strategies.set(definition.id, definition)
    },
    requireDeployStrategy(id) {
      return requireItem(strategies, "deploy", id)
    },
    registerShift(definition) {
      shifts.set(definition.id, definition)
    },
    requireShift(id) {
      return requireItem(shifts, "shift", id)
    },
    registerSystem(system) {
      if (!isPhaseSlot(system.slot)) throw new UnknownRegistrationError("phase", system.slot)
      const entry: Ordered<PhaseSystem> = { item: system, order: nextOrder() }
      const index = systems.findIndex((current) => current.item.id === system.id)
      if (index >= 0) systems[index] = entry
      else systems.push(entry)
    },
    systemsIn(slot) {
      return systems
        .filter((system) => system.item.slot === slot)
        .sort((left, right) => left.item.priority - right.item.priority || left.order - right.order)
        .map((system) => system.item)
    },
  }
}

function requireItem<T>(table: Map<string, T>, registry: string, id: string): T {
  const item = table.get(id)
  if (!item) throw new UnknownRegistrationError(registry, id)
  return item
}
