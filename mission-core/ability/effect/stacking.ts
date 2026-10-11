import { defineExtensible } from "#kernel/registry/extensible.js"
import type {
  BattleRegistry,
  EffectDefinition,
  EffectIncoming,
  EffectRecord,
  EffectWait,
  StackingDefinition,
} from "#port/definition.js"

/** 内置叠加策略。refresh 是缺省。 */
export const STACKINGS = ["refresh", "extend", "stack", "independent", "strongest", "keep"] as const

const STRENGTH_EPSILON = 1e-12

export function registerBuiltinStackings(registry: BattleRegistry): void {
  for (const definition of [refreshStacking, extendStacking, stackStacking, independentStacking, strongestStacking, keepStacking]) {
    registry.registerStacking(definition)
    registry.markExtensible(defineExtensible(definition.id, { version: 1, contract: "stacking" }))
  }
}

/** 刷新时长，层数加 1 直到上限。 */
export const refreshStacking: StackingDefinition = {
  id: "refresh",
  apply(effects, existing, incoming, definition) {
    if (!existing) return push(effects, blank(definition, incoming, 1))
    existing.carried = true
    existing.priorRemaining = existing.permanent ? Number.POSITIVE_INFINITY : existing.remaining
    existing.pulse = 0
    if (existing.stacks < definition.stackCap) existing.stacks += 1
    writeSpan(existing, incoming)
    writeScale(existing, definition, incoming.value)
    return existing
  },
}

/** 时长取剩余与这次中更长的，层数加 1 直到上限。 */
export const extendStacking: StackingDefinition = {
  id: "extend",
  apply(effects, existing, incoming, definition) {
    if (!existing) return push(effects, blank(definition, incoming, 1))
    existing.carried = true
    existing.priorRemaining = existing.permanent ? Number.POSITIVE_INFINITY : existing.remaining
    existing.pulse = 0
    if (existing.stacks < definition.stackCap) existing.stacks += 1
    if (incoming.permanent || (!existing.permanent && incoming.ticks > existing.remaining)) writeSpan(existing, incoming)
    writeScale(existing, definition, incoming.value)
    return existing
  },
}

/** 按 value 加层（缺省 1），总数不超过上限，时长不变。强度记成层数。 */
export const stackStacking: StackingDefinition = {
  id: "stack",
  apply(effects, existing, incoming, definition) {
    const gain = Math.max(1, Math.round(incoming.value || 1))
    if (!existing) {
      if (definition.stackCap < 1) return undefined
      return push(effects, blank(definition, incoming, Math.min(definition.stackCap, gain)))
    }
    existing.stacks = Math.min(definition.stackCap, existing.stacks + gain)
    existing.strength = existing.stacks
    return existing
  },
}

/** 每次施加各自一条，各算各的时长；同时最多 stackCap 条，满了先去掉最早的那条。 */
export const independentStacking: StackingDefinition = {
  id: "independent",
  apply(effects, _existing, incoming, definition) {
    if (definition.stackCap < 1) return undefined
    const same = effects.filter((effect) => effect.id === definition.id && !effect.dropped && effect.source === null)
    for (const oldest of same.slice(0, Math.max(0, same.length - definition.stackCap + 1))) effects.splice(effects.indexOf(oldest), 1)
    return push(effects, blank(definition, incoming, 1))
  },
}

/** 已经在身上时这次施加不生效，留着原来的。 */
export const keepStacking: StackingDefinition = {
  id: "keep",
  apply(effects, existing, incoming, definition) {
    if (existing) return undefined
    return push(effects, blank(definition, incoming, 1))
  },
}

/**
 * 同名取最高：强度（stackAs 或 value 的绝对值）最高的一次生效。其余按强度递减、到期递增排成等待链，
 * 当前一次结束后依次接续；强度相同时保留更长的时长。
 */
export const strongestStacking: StackingDefinition = {
  id: "strongest",
  apply(effects, existing, incoming, definition) {
    if (!existing) return push(effects, blank(definition, incoming, 1))
    const next = strengthOf(incoming.value, incoming.stackAs)
    const current = strengthOf(existing.strength, existing.stackAs)
    const oldEnd = endOf(existing, incoming.at)
    const newEnd = incoming.permanent ? Number.POSITIVE_INFINITY : incoming.at + incoming.ticks
    if (next > current + STRENGTH_EPSILON) {
      const waits = after([{ value: existing.strength, stackAs: existing.stackAs, until: oldEnd }, ...existing.waits], newEnd)
      existing.carried = true
      existing.priorRemaining = existing.permanent ? Number.POSITIVE_INFINITY : existing.remaining
      writeSpan(existing, incoming)
      writeScale(existing, definition, incoming.value)
      existing.stackAs = incoming.stackAs
      existing.waits = waits
      return existing
    }
    if (next < current - STRENGTH_EPSILON) {
      if (newEnd > oldEnd) existing.waits = insertWait(existing.waits, { value: incoming.value, stackAs: incoming.stackAs, until: newEnd })
      return undefined
    }
    if (incoming.permanent || newEnd > oldEnd) {
      writeSpan(existing, incoming)
      existing.waits = after(existing.waits, newEnd)
    }
    return existing
  },
}

/** 当前一次在 tick 结束后接上等待链里第一项仍未到期的。没有可接的返回 false。 */
export function resumeWait(effect: EffectRecord, definition: EffectDefinition, tick: number): boolean {
  const waits = after(effect.waits, tick)
  const head = waits[0]
  if (!head) return false
  effect.permanent = head.until === Number.POSITIVE_INFINITY
  effect.remaining = effect.permanent ? 0 : head.until - tick
  effect.stackAs = head.stackAs
  effect.waits = waits.slice(1)
  writeScale(effect, definition, head.value)
  return true
}

function strengthOf(value: number, stackAs: number | null): number {
  return Math.abs(stackAs ?? value)
}

/** 去掉到期不晚于 until 的项。 */
function after(waits: readonly EffectWait[], until: number): EffectWait[] {
  let index = 0
  while (index < waits.length && (waits[index]?.until ?? 0) <= until) index += 1
  return waits.slice(index)
}

function insertWait(waits: readonly EffectWait[], incoming: EffectWait): EffectWait[] {
  const [head, ...rest] = waits
  if (!head) return [incoming]
  const diff = strengthOf(incoming.value, incoming.stackAs) - strengthOf(head.value, head.stackAs)
  if (diff > STRENGTH_EPSILON) return [incoming, ...after(waits, incoming.until)]
  if (diff < -STRENGTH_EPSILON) {
    if (incoming.until <= head.until) return [...waits]
    return [head, ...insertWait(rest, incoming)]
  }
  const kept = incoming.until > head.until ? incoming : head
  return [kept, ...after(rest, kept.until)]
}

function push(effects: EffectRecord[], record: EffectRecord): EffectRecord {
  effects.push(record)
  return record
}

/** 一条新记录。护盾按定义里 shield、shieldHits 的加值乘层数。 */
export function blank(definition: EffectDefinition, incoming: EffectIncoming, stacks: number): EffectRecord {
  let shield = 0
  let shieldHits = 0
  for (const modifier of definition.modifiers) {
    if (modifier.op !== "add") continue
    if (modifier.attribute === "shield") shield += modifier.value * stacks
    if (modifier.attribute === "shieldHits") shieldHits += modifier.value * stacks
  }
  const record: EffectRecord = {
    id: definition.id,
    stacks,
    remaining: incoming.permanent ? 0 : incoming.ticks,
    permanent: incoming.permanent,
    shield,
    shieldHits,
    runtimeModifiers: [],
    pulse: 0,
    carried: false,
    priorRemaining: 0,
    strength: incoming.value,
    stackAs: incoming.stackAs,
    dropped: false,
    waits: [],
    source: null,
  }
  writeScale(record, definition, incoming.value)
  return record
}

function writeSpan(effect: EffectRecord, incoming: EffectIncoming): void {
  effect.permanent = incoming.permanent
  effect.remaining = incoming.permanent ? 0 : incoming.ticks
}

function writeScale(effect: EffectRecord, definition: EffectDefinition, value: number): void {
  effect.strength = value
  if (definition.scale) effect.runtimeModifiers = [...definition.scale(value)]
}

function endOf(effect: EffectRecord, at: number): number {
  return effect.permanent ? Number.POSITIVE_INFINITY : at + effect.remaining
}
