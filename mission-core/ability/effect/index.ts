import type { ContentContext } from "#port/context.js"
import type { EffectApplication, EffectDefinition, EffectIncoming } from "#port/definition.js"
import type { BattleRegistry } from "#port/definition.js"
import { requireUnit, type BattleWorld } from "#unit/record/index.js"
import { clearElements } from "#combat/element/index.js"
import { overhealOf, setOverheal } from "#combat/damage/shield.js"
import { immuneTo, refuseEffect, shortenControlled } from "#ability/effect/catalog.js"
import { refreshTags } from "#ability/effect/tag.js"
import { resumeWait } from "#ability/effect/stacking.js"
import { cancelTimer, startTimer } from "#unit/record/timer.js"
import { hasTag } from "#kernel/world/tag.js"
import { BURST_LOCK } from "#port/tag.js"
import { TICK } from "#kernel/tick/index.js"
import type { EffectRecord, UnitState } from "#unit/record/index.js"

/** defineEffect 的输入。没写的字段取缺省：不授予标签、没有修饰、一层、一直持续、refresh 叠加。 */
export interface EffectOptions {
  readonly grantsTags?: EffectDefinition["grantsTags"]
  readonly modifiers?: EffectDefinition["modifiers"]
  readonly immunity?: EffectDefinition["immunity"]
  readonly immune?: string
  readonly stackCap?: number
  readonly cancels?: readonly string[]
  /** 秒。0 或缺省表示一直持续。 */
  readonly duration?: number
  readonly instant?: boolean
  /** onTick 的间隔，秒。缺省每拍。 */
  readonly period?: number
  readonly stacking?: string
  readonly valued?: number
  readonly scale?: EffectDefinition["scale"]
  readonly onApply?: EffectDefinition["onApply"]
  readonly onTick?: EffectDefinition["onTick"]
  readonly onRemove?: EffectDefinition["onRemove"]
}

/** 写出一份效果定义。时长与间隔按秒给出，换成效果计时器的拍数。 */
export function defineEffect(id: string, options: EffectOptions = {}): EffectDefinition {
  const seconds = options.duration ?? 0
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error(`effect duration must be a finite number of seconds: ${id}`)
  return {
    id,
    grantsTags: options.grantsTags ?? [],
    modifiers: options.modifiers ?? [],
    immunity: options.immunity ?? [],
    stackCap: options.stackCap ?? 1,
    cancels: options.cancels ?? [],
    duration: seconds > 0 ? Math.max(1, Math.round(seconds / TICK)) : 0,
    instant: options.instant === true,
    period: options.period !== undefined && options.period > 0 ? Math.max(1, Math.round(options.period / TICK)) : 1,
    stacking: options.stacking ?? "refresh",
    ...(options.immune ? { immune: options.immune } : {}),
    ...(options.valued !== undefined ? { valued: options.valued } : {}),
    ...(options.scale ? { scale: options.scale } : {}),
    ...(options.onApply ? { onApply: options.onApply } : {}),
    ...(options.onTick ? { onTick: options.onTick } : {}),
    ...(options.onRemove ? { onRemove: options.onRemove } : {}),
  }
}

export function registerEffectTimer(registry: BattleRegistry, state: BattleWorld): void {
  registry.registerTimer({
    id: "status",
    slot: "status",
    create: () => ({ elapsed: 0 }),
    advance(timer, unitId, runCtx) {
      timer.elapsed = number(timer.elapsed) + 1
      tickEffects(state, registry, runCtx, unitId)
    },
    cancel(timer) {
      timer.elapsed = 0
    },
    view(timer) {
      return { elapsed: number(timer.elapsed) }
    },
  })
}

export function applyEffect(
  state: BattleWorld,
  registry: BattleRegistry,
  ctx: ContentContext,
  unitId: string,
  effectId: string,
  application?: EffectApplication,
): void {
  const definition = registry.requireEffect(effectId)
  for (const timerId of definition.cancels) registry.requireTimer(timerId)
  const unit = requireUnit(state, unitId)
  if (immuneTo(state, registry, unit, effectId) || refuseEffect(unit, effectId)) return
  const span = spanOf(application?.duration, definition)
  if (!span) return
  const incoming: EffectIncoming = {
    ...span,
    value: application?.value ?? definition.valued ?? 0,
    stackAs: application?.stackAs !== undefined && Number.isFinite(application.stackAs) ? application.stackAs : null,
    at: state.tick,
  }
  if (definition.instant) {
    for (const timerId of definition.cancels) cancelTimer(state, registry, unitId, timerId)
    definition.onApply?.(unitId, 1, ctx)
    ctx.emit("status", { unitId, statusId: effectId, stacks: 1 })
    return
  }
  const existing = unit.effects.find((effect) => effect.id === effectId && !effect.dropped && effect.source === null)
  const applied = registry.requireStacking(definition.stacking).apply(unit.effects, existing, incoming, definition)
  if (!applied) return
  shortenControlled(unit, applied)
  refreshTags(registry, unit)
  for (const timerId of definition.cancels) cancelTimer(state, registry, unitId, timerId)
  startTimer(state, registry, unitId, "status")
  definition.onApply?.(unitId, applied.stacks, ctx)
  ctx.emit("status", { unitId, statusId: effectId, stacks: applied.stacks })
}

/** 取下这个效果的全部记录并调用 onRemove。 */
export function removeEffect(state: BattleWorld, registry: BattleRegistry, ctx: ContentContext, unitId: string, effectId: string): void {
  const unit = requireUnit(state, unitId)
  const removed = unit.effects.filter((effect) => effect.id === effectId && !effect.dropped)
  if (removed.length === 0) return
  for (const effect of removed) effect.dropped = true
  const kept = unit.effects.filter((effect) => !effect.dropped)
  unit.effects.length = 0
  unit.effects.push(...kept)
  afterRemoval(state, registry, unit, removed)
  registry.requireEffect(effectId).onRemove?.(unitId, ctx)
}

/** 按条件挂上或取下一条条件效果。source 区分同一单位上的多条条件效果。 */
export function holdConditionalEffect(
  state: BattleWorld,
  registry: BattleRegistry,
  ctx: ContentContext,
  unit: UnitState,
  source: string,
  effectId: string,
  value: number | undefined,
  held: boolean,
): void {
  const existing = unit.effects.find((effect) => effect.source === source && !effect.dropped)
  if (held === (existing !== undefined)) return
  const definition = registry.requireEffect(effectId)
  if (existing) {
    existing.dropped = true
    unit.effects.splice(unit.effects.indexOf(existing), 1)
    refreshTags(registry, unit)
    definition.onRemove?.(unit.id, ctx)
    return
  }
  if (immuneTo(state, registry, unit, effectId)) return
  const record: EffectRecord = {
    id: effectId,
    stacks: 1,
    remaining: 0,
    permanent: true,
    shield: 0,
    shieldHits: 0,
    runtimeModifiers: definition.scale ? [...definition.scale(value ?? definition.valued ?? 0)] : [],
    pulse: 0,
    carried: false,
    priorRemaining: 0,
    strength: value ?? definition.valued ?? 0,
    stackAs: null,
    dropped: false,
    waits: [],
    source,
  }
  unit.effects.push(record)
  refreshTags(registry, unit)
  definition.onApply?.(unit.id, 1, ctx)
}

function tickEffects(state: BattleWorld, registry: BattleRegistry, ctx: ContentContext, unitId: string): void {
  const unit = requireUnit(state, unitId)
  const locked = hasTag(unit, BURST_LOCK)
  const current = unit.effects.slice()
  const kept: EffectRecord[] = []
  const expired: EffectRecord[] = []
  for (const effect of current) {
    if (effect.dropped) continue
    const definition = registry.requireEffect(effect.id)
    if (definition.onTick && (definition.period <= 1 || (state.tick + 1) % definition.period === 0)) {
      definition.onTick(unitId, effect.stacks, ctx)
    }
    if (effect.dropped) continue
    if (!effect.permanent) effect.remaining -= 1
    if (effect.permanent || effect.remaining > 0) {
      kept.push(effect)
      continue
    }
    if (resumeWait(effect, definition, state.tick)) kept.push(effect)
    else expired.push(effect)
  }
  const arrived = unit.effects.filter((effect) => !current.includes(effect) && !effect.dropped)
  const next = [...kept.filter((effect) => !effect.dropped), ...arrived]
  const overhealWas = current.some((effect) => effect.id === "overheal" && !effect.dropped)
  unit.effects.length = 0
  unit.effects.push(...next)
  if (overhealWas && !next.some((effect) => effect.id === "overheal")) clearOverhealShield(state, unit)
  refreshTags(registry, unit)
  if (locked && !hasTag(unit, BURST_LOCK)) clearElements(state, unit.id)
  for (const effect of expired) registry.requireEffect(effect.id).onRemove?.(unitId, ctx)
}

function afterRemoval(state: BattleWorld, registry: BattleRegistry, unit: UnitState, removed: readonly EffectRecord[]): void {
  if (removed.some((effect) => effect.id === "overheal") && !unit.effects.some((effect) => effect.id === "overheal")) {
    clearOverhealShield(state, unit)
  }
  refreshTags(registry, unit)
}

function spanOf(seconds: number | undefined, definition: EffectDefinition): { ticks: number; permanent: boolean } | null {
  if (seconds === undefined) {
    if (definition.duration <= 0) return { ticks: 0, permanent: true }
    return { ticks: definition.duration, permanent: false }
  }
  if (seconds === Number.POSITIVE_INFINITY) return { ticks: 0, permanent: true }
  if (!(seconds > 0) || !Number.isFinite(seconds)) return null
  return { ticks: Math.max(1, Math.round(seconds / TICK)), permanent: false }
}

function clearOverhealShield(state: BattleWorld, unit: UnitState): void {
  const over = overhealOf(state, unit.id)
  if (over !== 0) setOverheal(state, unit.id, 0)
  if (!(over > 0)) return
  const pool = unit.attributes.shield ?? 0
  unit.attributes.shield = Math.max(0, pool - over)
}

function number(value: string | number | boolean | undefined): number {
  return typeof value === "number" ? value : 0
}
