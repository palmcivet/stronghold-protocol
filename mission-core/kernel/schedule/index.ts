import { isPhaseSlot, type PhaseSlot } from "#contract/phase.js"
import { UnknownRegistrationError } from "#kernel/registry/error.js"
import type { Identified, OrderedTable } from "#kernel/registry/index.js"

/** 排进阶段槽的一项。同一槽里 priority 小的先执行，相同时按注册先后。 */
export interface Slotted extends Identified {
  readonly slot: PhaseSlot
  readonly priority: number
}

/** 未知阶段槽在注册时拒绝。 */
export function requireSlot(slot: string): void {
  if (!isPhaseSlot(slot)) throw new UnknownRegistrationError("phase", slot)
}

/** priority 小的在前，相同时由表按注册先后。给 createOrderedTable 作 compare。 */
export function byPriority(left: { readonly priority: number }, right: { readonly priority: number }): number {
  return left.priority - right.priority
}

/** 按槽取表里的项，保持 ordered() 的顺序。表没有新注册时同一个槽返回同一个数组。 */
export function slotIndex<T extends Identified & { readonly slot: PhaseSlot }>(
  table: OrderedTable<T>,
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
    const items = table.ordered().filter((item) => item.slot === slot)
    bySlot.set(slot, items)
    return items
  }
}
