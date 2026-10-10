import type { BattleEvent } from "#contract/event.js"

export type EventHandler = (event: BattleEvent) => void

/** 本场发出的事件与订阅者。事件按发出顺序记下，等待取走。 */
export interface EventLog {
  pending: BattleEvent[]
  readonly subscribers: Map<string, EventHandler[]>
}

export function createEventLog(): EventLog {
  return { pending: [], subscribers: new Map() }
}

/** 记下事件，再按订阅顺序交给这一类事件的订阅者。 */
export function emit(world: { readonly tick: number; readonly events: EventLog }, type: string, data: Readonly<Record<string, unknown>>): void {
  const event: BattleEvent = { tick: world.tick, type, data }
  world.events.pending.push(event)
  const handlers = world.events.subscribers.get(type)
  if (!handlers) return
  for (const handler of [...handlers]) handler(event)
}

/** 返回取消订阅的函数。 */
export function subscribe(log: EventLog, type: string, handler: EventHandler): () => void {
  const list = log.subscribers.get(type) ?? []
  list.push(handler)
  log.subscribers.set(type, list)
  return () => {
    const current = log.subscribers.get(type)
    if (!current) return
    const index = current.indexOf(handler)
    if (index >= 0) current.splice(index, 1)
  }
}

/** 取走还没取走的事件。 */
export function drainEvents(log: EventLog): readonly BattleEvent[] {
  const events = log.pending
  log.pending = []
  return events
}
