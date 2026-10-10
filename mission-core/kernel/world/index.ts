import type { BattleSpec } from "#contract/spec.js"
import { createEventLog, type EventLog } from "#kernel/event/index.js"
import { createRandom, type Random } from "#kernel/random/index.js"
import { createComponentStore, type ComponentStore } from "#kernel/world/component.js"
import { createResourceStore, type ResourceStore } from "#kernel/world/resource.js"

/** 实体就是单位 id。核心记录只放各机制共享的事实。 */
export interface Entity {
  readonly id: string
}

/** 一场战斗的全部可变状态。 */
export interface World<E extends Entity> {
  readonly spec: BattleSpec
  tick: number
  /** 核心记录，按入场顺序。 */
  readonly units: Map<string, E>
  readonly random: Random
  readonly components: ComponentStore
  readonly resources: ResourceStore
  readonly events: EventLog
}

export function createWorld<E extends Entity>(spec: BattleSpec): World<E> {
  return {
    spec,
    tick: 0,
    units: new Map(),
    random: createRandom(spec.seed),
    components: createComponentStore(),
    resources: createResourceStore(spec),
    events: createEventLog(),
  }
}

export function requireEntity<E extends Entity>(world: World<E>, id: string): E {
  const entity = world.units.get(id)
  if (!entity) throw new Error(`单位不存在: ${id}`)
  return entity
}
