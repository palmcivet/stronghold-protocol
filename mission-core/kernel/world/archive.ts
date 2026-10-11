import type { ComponentTables } from "#kernel/world/component.js"
import type { ResourceValues } from "#kernel/world/resource.js"
import type { Entity, World } from "#kernel/world/index.js"

/**
 * 世界的纯数据快照：只有普通对象、数组、字符串、布尔、null 与数字（数字可以是 ±Infinity、NaN 或 -0），
 * 可以深拷贝，也可以用保留非有限数的格式写出。不含待取走的事件与订阅者。
 */
export interface WorldArchive {
  readonly tick: number
  /** 随机流的状态。 */
  readonly random: number
  /** 核心记录，按入场顺序，由调用方编码。 */
  readonly units: readonly unknown[]
  readonly components: ComponentTables
  readonly resources: ResourceValues
}

/** 核心记录与纯数据之间的转换。 */
export interface EntityCodec<E extends Entity> {
  encode(entity: E): unknown
  decode(data: unknown): E
}

/** 导出世界。结果与世界不共享对象；值不是纯数据时报出路径。 */
export function exportWorld<E extends Entity>(world: World<E>, codec: EntityCodec<E>): WorldArchive {
  const archive: WorldArchive = {
    tick: world.tick,
    random: world.random.state(),
    units: [...world.units.values()].map((entity) => codec.encode(entity)),
    components: world.components.export(),
    resources: world.resources.export(),
  }
  requirePlain(archive, "archive")
  return clonePlain(archive)
}

/** 把世界换成导出时的状态。规格、注册、订阅与 transient 资源保持不变；待取走的事件清空。 */
export function importWorld<E extends Entity>(world: World<E>, archive: WorldArchive, codec: EntityCodec<E>): void {
  requirePlain(archive, "archive")
  const copy = clonePlain(archive)
  world.tick = copy.tick
  world.random.restore(copy.random)
  world.units.clear()
  for (const data of copy.units) {
    const entity = codec.decode(data)
    world.units.set(entity.id, entity)
  }
  world.components.import(copy.components)
  world.resources.import(copy.resources)
  world.events.pending = []
}

/** 深拷贝已经确认是纯数据的值。 */
function clonePlain<T>(value: T): T {
  if (value === null || typeof value !== "object") return value
  if (Array.isArray(value)) return value.map((item: unknown) => clonePlain(item)) as T
  const copy: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) copy[key] = clonePlain(item)
  return copy as T
}

/** 只接受普通对象、数组与原始值，函数、Map、Set、类型化数组和类实例都报出路径。 */
export function requirePlain(value: unknown, path: string): void {
  if (value === null) return
  const type = typeof value
  if (type === "number" || type === "string" || type === "boolean") return
  if (type !== "object") throw new Error(`not plain data at ${path}: ${type}`)
  if (Array.isArray(value)) {
    value.forEach((item, index) => requirePlain(item, `${path}[${index}]`))
    return
  }
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`not plain data at ${path}: ${(value as object).constructor?.name ?? "object"}`)
  }
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (item === undefined) continue
    requirePlain(item, `${path}.${key}`)
  }
}
