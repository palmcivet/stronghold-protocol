import { createOrderedTable, createTable, type OrderedTable, type Table } from "#kernel/registry/index.js"
import { createExtensibleCatalog, type ExtensibleKey } from "#kernel/registry/extensible.js"
import { ExtensionRefusedError } from "#kernel/registry/error.js"
import { PHASE_SLOTS } from "#contract/phase.js"
import { arrangeConstrained, byPriority, requireSlot, slotIndex } from "#kernel/schedule/index.js"
import { createTagCatalog } from "#kernel/world/tag.js"
import {
  DAMAGE_STAGES,
  type AttributeDefinition,
  type BattleRegistry,
  type ConditionDefinition,
  type DamageModifierDefinition,
  type DamageStage,
  type DamageStepDefinition,
  type DeployStrategyDefinition,
  type EffectDefinition,
  type ElementDefinition,
  type ExtensibleContract,
  type ExtensibleDefinitions,
  type PhaseSystem,
  type SelectorDefinition,
  type ShiftDefinition,
  type SkillBodyDefinition,
  type SkillHookDefinition,
  type SkillTriggerDefinition,
  type StackingDefinition,
  type ContentTimerDefinition,
} from "#port/definition.js"

/** 引擎自己做的替换记在这个名下。 */
const CORE = "core"

export function createRegistry(): BattleRegistry {
  const attributes = createTable<AttributeDefinition>("attribute")
  const effects = createTable<EffectDefinition>("effect")
  const stackings = createTable<StackingDefinition>("stacking")
  const conditions = createTable<ConditionDefinition>("condition")
  const hooks = createTable<SkillHookDefinition>("skill-hook")
  const elements = createTable<ElementDefinition>("element")
  const selectors = createTable<SelectorDefinition>("selector")
  const triggers = createTable<SkillTriggerDefinition>("skill-trigger")
  const bodies = createTable<SkillBodyDefinition>("skill-body")
  const timers = createOrderedTable<ContentTimerDefinition>("timer")
  const strategies = createTable<DeployStrategyDefinition>("deploy")
  const shifts = createTable<ShiftDefinition>("shift")
  const steps = createOrderedTable<DamageStepDefinition>("damage-step", { compare: byPriority })
  const modifiers = createOrderedTable<DamageModifierDefinition>("damage-modifier", { compare: byPriority })
  const systems = createOrderedTable<PhaseSystem>("system", { compare: byPriority })
  const tags = createTagCatalog()
  const timersIn = slotIndex(timers)
  const systemsIn = slotIndex(systems, (items) => arrangeConstrained(items, "system"))
  const modifiersIn = stageIndex(modifiers)
  const extensible = createExtensibleCatalog()
  let installer = CORE

  const open: { readonly [C in ExtensibleContract]: Table<ExtensibleDefinitions[C]> } = {
    "skill-trigger": triggers,
    "skill-body": bodies,
    selector: selectors,
    "damage-step": steps,
    stacking: stackings,
    condition: conditions,
    deploy: strategies,
    element: elements,
  }
  const tableOf = <C extends ExtensibleContract>(key: ExtensibleKey<C>): Table<ExtensibleDefinitions[C]> => {
    const table = open[key.contract] as Table<ExtensibleDefinitions[C]> | undefined
    if (!table) throw new ExtensionRefusedError(key.contract, key.id, "this registry is not extensible")
    return table
  }

  return {
    registerAttribute: (definition) => attributes.register(definition),
    findAttribute: (id) => (attributes.has(id) ? attributes.require(id) : undefined),
    registerEffect: (definition) => effects.register(definition),
    requireEffect: (id) => effects.require(id),
    hasEffect: (id) => effects.has(id),
    registerStacking: (definition) => stackings.register(definition),
    requireStacking: (id) => stackings.require(id),
    registerCondition: (definition) => conditions.register(definition),
    requireCondition: (id) => conditions.require(id),
    registerSkillHook: (definition) => hooks.register(definition),
    requireSkillHook: (id) => hooks.require(id),
    registerDamageStep: (definition) => steps.register(definition),
    damageSteps: () => steps.ordered(),
    registerDamageModifier(definition) {
      if (!(DAMAGE_STAGES as readonly string[]).includes(definition.stage)) {
        throw new Error(`unknown damage stage: ${String(definition.stage)}`)
      }
      modifiers.register(definition)
    },
    damageModifiers: modifiersIn,
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
    installing(moduleId) {
      installer = moduleId
    },
    markExtensible(key) {
      tableOf(key)
      extensible.mark(key)
    },
    replace(key, definition) {
      if (definition.id !== key.id) throw new ExtensionRefusedError(key.contract, key.id, `replacement has id ${definition.id}`)
      const table = tableOf(key)
      table.require(key.id)
      extensible.extend(key, "replace", installer)
      table.replace(definition)
    },
    wrap(key, wrap) {
      const table = tableOf(key)
      const inner = table.require(key.id)
      extensible.extend(key, "wrap", installer)
      const wrapped = wrap(inner)
      if (wrapped.id !== key.id) throw new ExtensionRefusedError(key.contract, key.id, `wrapper has id ${wrapped.id}`)
      table.replace(wrapped)
    },
    extensions: () => extensible.chain(),
  }
}

function stageIndex(
  table: OrderedTable<DamageModifierDefinition>,
): (stage: DamageStage) => readonly DamageModifierDefinition[] {
  let version = -1
  const byStage = new Map<DamageStage, readonly DamageModifierDefinition[]>()
  return (stage) => {
    if (version !== table.version) {
      version = table.version
      byStage.clear()
    }
    const found = byStage.get(stage)
    if (found) return found
    const items = table.ordered().filter((item) => item.stage === stage)
    byStage.set(stage, items)
    return items
  }
}
