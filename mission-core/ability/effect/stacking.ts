import type { StatusDefinition, StatusIncoming, StatusRecord } from "#port/definition.js"

/** 刷新时长，层数加到上限。缺省叠法。 */
export function refreshOverlap(
  statuses: StatusRecord[],
  existing: StatusRecord | undefined,
  incoming: StatusIncoming,
  definition: StatusDefinition,
): StatusRecord {
  if (!existing) {
    const created = blank(definition, incoming, 1)
    statuses.push(created)
    return created
  }
  existing.carried = true
  existing.priorRemaining = existing.permanent ? Number.POSITIVE_INFINITY : existing.remaining
  existing.pulse = 0
  if (existing.stacks < definition.stackCap) existing.stacks += 1
  writeSpan(existing, incoming)
  writeScale(existing, definition, incoming.value)
  return existing
}

/**
 * 同名取绝对值更高的一次。弱的不盖过强的，时长更长时记下来，强的结束再续上。
 * 强度相同则保留更长的时长。
 */
export function strongestOverlap(
  statuses: StatusRecord[],
  existing: StatusRecord | undefined,
  incoming: StatusIncoming,
  definition: StatusDefinition,
): StatusRecord | undefined {
  if (!existing) {
    const created = blank(definition, incoming, 1)
    statuses.push(created)
    return created
  }
  const next = Math.abs(incoming.value)
  const current = Math.abs(existing.strength)
  const oldEnd = endOf(existing, incoming.at)
  const newEnd = endOfIncoming(incoming)
  if (next > current + 1e-12) {
    const tail = longerTail(
      oldEnd > newEnd ? { value: existing.strength, until: oldEnd } : null,
      existing.tail && existing.tail.until > newEnd ? existing.tail : null,
    )
    existing.carried = true
    existing.priorRemaining = existing.permanent ? Number.POSITIVE_INFINITY : existing.remaining
    writeSpan(existing, incoming)
    writeScale(existing, definition, incoming.value)
    existing.tail = tail
    return existing
  }
  if (next < current - 1e-12) {
    if (newEnd > oldEnd && (!existing.tail || newEnd > existing.tail.until)) {
      existing.tail = { value: incoming.value, until: newEnd }
    }
    return undefined
  }
  if (incoming.permanent || newEnd > oldEnd) writeSpan(existing, incoming)
  return existing
}

/** 麻痹：value 是这次加上的层数，缺省 1，总数不超过上限。 */
export function palsyOverlap(
  statuses: StatusRecord[],
  existing: StatusRecord | undefined,
  incoming: StatusIncoming,
  definition: StatusDefinition,
): StatusRecord | undefined {
  const gain = Math.max(1, Math.round(incoming.value || 1))
  if (!existing) {
    if (definition.stackCap < 1) return undefined
    const created = blank(definition, incoming, Math.min(definition.stackCap, gain))
    statuses.push(created)
    return created
  }
  existing.stacks = Math.min(definition.stackCap, existing.stacks + gain)
  existing.strength = existing.stacks
  return existing
}

function blank(definition: StatusDefinition, incoming: StatusIncoming, stacks: number): StatusRecord {
  const pools = shieldPools(definition, stacks)
  const record: StatusRecord = {
    id: definition.id,
    stacks,
    remaining: incoming.permanent ? 0 : incoming.ticks,
    permanent: incoming.permanent,
    shield: pools.shield,
    shieldHits: pools.shieldHits,
    runtimeModifiers: [],
    pulse: 0,
    carried: false,
    priorRemaining: 0,
    strength: incoming.value,
    dropped: false,
    tail: null,
  }
  writeScale(record, definition, incoming.value)
  return record
}

function writeSpan(status: StatusRecord, incoming: StatusIncoming): void {
  status.permanent = incoming.permanent
  status.remaining = incoming.permanent ? 0 : incoming.ticks
}

function writeScale(status: StatusRecord, definition: StatusDefinition, value: number): void {
  status.strength = value
  if (!definition.scale) return
  status.runtimeModifiers = [...definition.scale(value)]
}

function shieldPools(definition: StatusDefinition, stacks: number): { shield: number; shieldHits: number } {
  let shield = 0
  let shieldHits = 0
  for (const modifier of definition.modifiers) {
    if (modifier.op !== "add") continue
    if (modifier.attribute === "shield") shield += modifier.value * stacks
    if (modifier.attribute === "shieldHits") shieldHits += modifier.value * stacks
  }
  return { shield, shieldHits }
}

function endOf(status: StatusRecord, at: number): number {
  if (status.permanent) return Number.POSITIVE_INFINITY
  return at + status.remaining
}

function endOfIncoming(incoming: StatusIncoming): number {
  if (incoming.permanent) return Number.POSITIVE_INFINITY
  return incoming.at + incoming.ticks
}

function longerTail(
  left: { value: number; until: number } | null,
  right: { value: number; until: number } | null,
): { value: number; until: number } | null {
  if (!left) return right
  if (!right) return left
  return right.until > left.until ? right : left
}
