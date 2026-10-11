import type { BattleEvent, BattleEventType } from "#contract/event.js"
import type { ExtensibleKey } from "#kernel/registry/extensible.js"
import type { TagKey } from "#kernel/world/tag.js"
import type { ContentContext } from "#port/context.js"
import type {
  AttributeDefinition,
  ConditionDefinition,
  DamageModifierDefinition,
  DamageStepDefinition,
  DeployStrategyDefinition,
  EffectDefinition,
  ElementDefinition,
  ExtensibleContract,
  ExtensibleDefinitions,
  PhaseSystem,
  SelectorDefinition,
  ShiftDefinition,
  SkillBodyDefinition,
  SkillHookDefinition,
  SkillTriggerDefinition,
  StackingDefinition,
  TimerDefinition,
} from "#port/definition.js"

/**
 * install 只能注册和订阅。同一张表里同 id 再注册报 RegistrationConflictError；
 * 标成可扩展的 id 用 replace 或 wrap 换掉，替换链计入 contentHash。
 */
export interface Registration {
  registerAttribute(definition: AttributeDefinition): void
  registerEffect(definition: EffectDefinition): void
  registerStacking(definition: StackingDefinition): void
  registerCondition(definition: ConditionDefinition): void
  registerSkillHook(definition: SkillHookDefinition): void
  registerDamageStep(definition: DamageStepDefinition): void
  registerDamageModifier(definition: DamageModifierDefinition): void
  registerElement(definition: ElementDefinition): void
  registerSelector(definition: SelectorDefinition): void
  registerSkillTrigger(definition: SkillTriggerDefinition): void
  registerSkillBody(definition: SkillBodyDefinition): void
  registerTimer(definition: TimerDefinition): void
  registerDeployStrategy(definition: DeployStrategyDefinition): void
  registerShift(definition: ShiftDefinition): void
  registerSystem(system: PhaseSystem): void
  /** 让单位规格可以按 id 写这个标签。建战斗时规格里的标签必须都已注册。 */
  registerTag(key: TagKey): void
  /** 标记一个注册 id 允许 replace 与 wrap。 */
  markExtensible(key: ExtensibleKey<ExtensibleContract>): void
  /** 换掉标成可扩展的注册项。key 的版本必须与标记时一致。 */
  replace<C extends ExtensibleContract>(key: ExtensibleKey<C>, definition: ExtensibleDefinitions[C]): void
  /** 用 wrap 的返回值换掉标成可扩展的注册项，wrap 拿到原来那项。 */
  wrap<C extends ExtensibleContract>(key: ExtensibleKey<C>, wrap: (inner: ExtensibleDefinitions[C]) => ExtensibleDefinitions[C]): void
  /** 订阅一类事件。可拦截的事件拿到可写的数据并同步收到；只读事件在分发中发出时排队，先进先出。 */
  subscribe<K extends BattleEventType>(type: K, handler: (event: BattleEvent<K>, ctx: ContentContext) => void): () => void
}

export interface MissionModule {
  readonly id: string
  /** 模块版本，计入 contentHash。缺省为空串。 */
  readonly version?: string
  readonly dependsOn?: readonly string[]
  install(ctx: Registration): void
}
