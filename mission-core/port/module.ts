import type { BattleEvent } from "#contract/event.js"
import type { TagKey } from "#kernel/world/tag.js"
import type { ContentContext } from "#port/context.js"
import type {
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

/** install 只能注册和订阅。 */
export interface Registration {
  registerStatus(definition: StatusDefinition): void
  registerDamageStep(definition: DamageStepDefinition): void
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
  subscribe(type: string, handler: (event: BattleEvent, ctx: ContentContext) => void): () => void
}

export interface MissionModule {
  readonly id: string
  readonly dependsOn?: readonly string[]
  install(ctx: Registration): void
}
