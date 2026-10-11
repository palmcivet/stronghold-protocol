import type { BattleEvent, BattleEventType, EventData, InterceptEventType, NoticeEventType } from "#contract/event.js"

export type EventHandler<K extends BattleEventType = BattleEventType> = (event: BattleEvent<K>) => void

/**
 * 本场发出的事件与订阅者。事件按发出顺序记下，等待取走。
 * 可拦截的事件（intercept）立即同步分发；只读事件（emit）在分发中发出时排进 queue，等最外层这一条分发完按先进先出分发。
 */
export interface EventLog {
  pending: BattleEvent[]
  readonly subscribers: Map<string, EventHandler<never>[]>
  readonly queue: BattleEvent[]
  /** 正在分发订阅者时为真。 */
  dispatching: boolean
}

export function createEventLog(): EventLog {
  return { pending: [], subscribers: new Map(), queue: [], dispatching: false }
}

interface EventSource {
  readonly tick: number
  readonly events: EventLog
}

/** 记下只读事件并分发给订阅者，按订阅顺序。分发中发出时排队。 */
export function emit<K extends NoticeEventType>(world: EventSource, type: K, data: EventData<K>): void {
  const event = { tick: world.tick, type, data } as BattleEvent
  const log = world.events
  log.pending.push(event)
  if (!log.subscribers.has(type)) return
  if (log.dispatching) {
    log.queue.push(event)
    return
  }
  run(log, event)
}

/** 记下可拦截的事件并立即同步分发；返回后 data 是订阅者改写后的数据。 */
export function intercept<K extends InterceptEventType>(world: EventSource, type: K, data: EventData<K>): void {
  const event = { tick: world.tick, type, data } as BattleEvent
  const log = world.events
  log.pending.push(event)
  if (!log.subscribers.has(type)) return
  if (log.dispatching) {
    deliver(log, event)
    return
  }
  run(log, event)
}

/** 最外层分发：先分发 event，再按先进先出分发排队的事件。 */
function run(log: EventLog, event: BattleEvent): void {
  log.dispatching = true
  try {
    deliver(log, event)
    for (let index = 0; index < log.queue.length; index += 1) {
      const queued = log.queue[index]
      if (queued) deliver(log, queued)
    }
  } finally {
    log.dispatching = false
    log.queue.length = 0
  }
}

function deliver(log: EventLog, event: BattleEvent): void {
  const handlers = log.subscribers.get(event.type) as EventHandler[] | undefined
  if (!handlers || handlers.length === 0) return
  for (const handler of [...handlers]) handler(event)
}

/** 返回取消订阅的函数。 */
export function subscribe<K extends BattleEventType>(log: EventLog, type: K, handler: EventHandler<K>): () => void {
  const list = log.subscribers.get(type) ?? []
  list.push(handler as EventHandler<never>)
  log.subscribers.set(type, list)
  return () => {
    const current = log.subscribers.get(type)
    if (!current) return
    const index = current.indexOf(handler as EventHandler<never>)
    if (index >= 0) current.splice(index, 1)
  }
}

/** 取走还没取走的事件。换出数组，不复制。 */
export function drainEvents(log: EventLog): readonly BattleEvent[] {
  const events = log.pending
  log.pending = []
  return events
}
