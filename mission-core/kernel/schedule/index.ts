import { isPhaseSlot, type PhaseSlot } from "#contract/phase.js"
import { UnknownRegistrationError } from "#kernel/registry/error.js"
import type { Identified, OrderedTable } from "#kernel/registry/index.js"

/** 排进阶段槽的一项。同一槽里 priority 小的先执行，相同时按注册先后。 */
export interface Slotted extends Identified {
  readonly slot: PhaseSlot
  readonly priority: number
}

/** 可以用 before、after 指定同槽里相对位置的一项。 */
export interface Constrained extends Slotted {
  /** 排在这些同槽 id 之前。 */
  readonly before?: readonly string[]
  /** 排在这些同槽 id 之后。 */
  readonly after?: readonly string[]
}

/** 未知阶段槽在注册时拒绝。 */
export function requireSlot(slot: string): void {
  if (!isPhaseSlot(slot)) throw new UnknownRegistrationError("phase", slot)
}

/** priority 小的在前，相同时由表按注册先后。给 createOrderedTable 作 compare。 */
export function byPriority(left: { readonly priority: number }, right: { readonly priority: number }): number {
  return left.priority - right.priority
}

/** 按槽取表里的项，按 ordered() 的顺序再经 arrange 调整。表没有新注册时同一个槽返回同一个数组。 */
export function slotIndex<T extends Identified & { readonly slot: PhaseSlot }>(
  table: OrderedTable<T>,
  arrange: (items: readonly T[]) => readonly T[] = (items) => items,
): (slot: PhaseSlot) => readonly T[] {
  let version = -1
  const bySlot = new Map<PhaseSlot, readonly T[]>()
  return (slot) => {
    if (version !== table.version) {
      version = table.version
      bySlot.clear()
    }
    const found = bySlot.get(slot)
    if (found) return found
    const items = arrange(table.ordered().filter((item) => item.slot === slot))
    bySlot.set(slot, items)
    return items
  }
}

/**
 * 在 (priority, 注册先后) 的顺序上满足 before 与 after。
 * 每次取出所有约束都已满足的项里原顺序最靠前的一项，结果仍是确定的线性序。
 * 引用的 id 不在同一槽里时报 UnknownRegistrationError，约束成环时报错。
 */
export function arrangeConstrained<T extends Constrained>(items: readonly T[], registry: string): readonly T[] {
  if (!items.some((item) => item.before?.length || item.after?.length)) return items
  const index = new Map<string, number>()
  items.forEach((item, position) => index.set(item.id, position))
  const preceding: Set<number>[] = items.map(() => new Set<number>())
  const link = (first: string, then: string, owner: string): void => {
    const from = index.get(first)
    const to = index.get(then)
    const missing = from === undefined ? first : then
    if (from === undefined || to === undefined) throw new UnknownRegistrationError(registry, missing, `${registry} ${owner}`)
    preceding[to]?.add(from)
  }
  for (const item of items) {
    for (const id of item.before ?? []) link(item.id, id, item.id)
    for (const id of item.after ?? []) link(id, item.id, item.id)
  }
  const placed = new Set<number>()
  const result: T[] = []
  while (result.length < items.length) {
    let next = -1
    for (let position = 0; position < items.length; position += 1) {
      if (placed.has(position)) continue
      const waits = preceding[position]
      if (waits && [...waits].every((from) => placed.has(from))) {
        next = position
        break
      }
    }
    if (next < 0) {
      const left = items.filter((_, position) => !placed.has(position)).map((item) => item.id)
      throw new Error(`${registry} before/after 成环: ${left.join(", ")}`)
    }
    placed.add(next)
    const item = items[next]
    if (item) result.push(item)
  }
  return result
}
