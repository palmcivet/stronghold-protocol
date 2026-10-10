import { UnknownRegistrationError } from "#kernel/registry/error.js"

export interface Identified {
  readonly id: string
}

/** 按 id 注册的一张表。同 id 再注册换掉原来那项。 */
export interface Table<T extends Identified> {
  register(item: T): void
  has(id: string): boolean
  require(id: string): T
}

/** 记下注册先后的表。同 id 再注册换掉原来那项，并按这次注册重新计先后。 */
export interface OrderedTable<T extends Identified> extends Table<T> {
  /** 先按建表时给的 compare，再按注册先后。两次注册之间返回同一个数组。 */
  ordered(): readonly T[]
  /** 每次注册加 1。按它判断由 ordered() 推出的结果是否还能用。 */
  readonly version: number
}

export function createTable<T extends Identified>(registry: string): Table<T> {
  const items = new Map<string, T>()
  return {
    register(item) {
      items.set(item.id, item)
    },
    has: (id) => items.has(id),
    require(id) {
      const item = items.get(id)
      if (!item) throw new UnknownRegistrationError(registry, id)
      return item
    },
  }
}

/** compare 缺省时只按注册先后。 */
export function createOrderedTable<T extends Identified>(
  registry: string,
  compare?: (left: T, right: T) => number,
): OrderedTable<T> {
  let order = 0
  let version = 0
  let sorted: readonly T[] | null = null
  const entries = new Map<string, { item: T; order: number }>()
  return {
    register(item) {
      order += 1
      version += 1
      sorted = null
      entries.set(item.id, { item, order })
    },
    has: (id) => entries.has(id),
    require(id) {
      const entry = entries.get(id)
      if (!entry) throw new UnknownRegistrationError(registry, id)
      return entry.item
    },
    ordered() {
      sorted ??= [...entries.values()]
        .sort((left, right) => (compare ? compare(left.item, right.item) : 0) || left.order - right.order)
        .map((entry) => entry.item)
      return sorted
    },
    get version() {
      return version
    },
  }
}
