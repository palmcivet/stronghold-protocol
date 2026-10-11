import type { AttributeModifier, EffectDefinition } from "#port/definition.js"
import type { ContentContext } from "#port/context.js"
import type { BattleRegistry } from "#port/definition.js"
import { requireUnit, type BattleWorld } from "#unit/record/index.js"
import { attributeOf } from "#ability/effect/attribute.js"
import { TICK } from "#kernel/tick/index.js"
import type { EffectRecord, UnitState } from "#unit/record/index.js"
import { immunityOf } from "#ability/effect/immunity.js"
import {
  COLD_ASPD,
  COLD_FREEZE_DURATION,
  FREEZE_RES_DOWN,
  LEVITATE_HALF_WEIGHT,
  PALSY_MAX,
  RESIST_CAP,
  RESIST_DEFAULT,
  RESIST_PALSY_DECAY,
  RESISTED,
} from "#ability/effect/constants.js"
import { dropEffect } from "#ability/effect/tag.js"
import { hasTag, type TagKey } from "#kernel/world/tag.js"
import {
  ATTRACT,
  BIND,
  NO_MOVE,
  CAMOU,
  COLD,
  DISARM,
  FEAR,
  FREEZE,
  INVULNERABLE,
  ISOLATED,
  LEVITATE,
  LIFTOFF,
  NO_BLOCK,
  NO_DISPLACE,

  REVEAL,
  SILENCE,
  SLEEP,
  STEALTH,
  STEALTH_OFF,
  STUN,
  TREMBLE,
  UNBLOCKABLE,
} from "#port/tag.js"
import { defineEffect } from "#ability/effect/index.js"

const DECAY_TICKS = ticks(RESIST_PALSY_DECAY)

export function registerEffectCatalog(state: BattleWorld, registry: BattleRegistry): void {
  for (const definition of definitions(state, registry)) registry.registerEffect(definition)
}

/** 飞行单位和已经浮空的单位不再接受浮空。 */
export function refuseEffect(unit: UnitState, effectId: string): boolean {
  if (effectId !== "levitate") return false
  return unit.motion === "FLY" || hasTag(unit, LEVITATE)
}

/** 单位的免疫名单或身上效果的 immunity 挡住这个效果。 */
export function immuneTo(state: BattleWorld, registry: BattleRegistry, unit: UnitState, effectId: string): boolean {
  const incoming = registry.requireEffect(effectId)
  const key = incoming.immune
  if (key && immunityOf(state, unit.id).has(key)) return true
  for (const status of unit.effects) {
    if (status.dropped) continue
    const definition = registry.requireEffect(status.id)
    if (definition.immunity.includes(effectId)) return true
    if (key && definition.immunity.includes(key)) return true
  }
  return false
}

/** 控制效果的持续时间乘上 (1 − 抵抗)。一直持续的不缩短。 */
export function shortenControlled(unit: UnitState, status: EffectRecord): void {
  if (status.permanent || !RESISTED.has(status.id)) return
  const factor = 1 - resistOf(unit)
  if (!(factor > 0) || factor >= 1) return
  status.remaining *= factor
}

function definitions(state: BattleWorld, registry: BattleRegistry): readonly EffectDefinition[] {
  const attack = ["attack"]
  return [
    define({ id: "stun", tags: [STUN, NO_BLOCK], cancels: attack, immune: "stun" }),
    define({
      id: "freeze",
      tags: [FREEZE, STUN],
      cancels: attack,
      immune: "frozen",
      onApply(unitId) {
        const unit = requireUnit(state, unitId)
        const status = unit.effects.find((item) => item.id === "freeze")
        if (!status) return
        status.runtimeModifiers =
          unit.side === "enemy" ? [{ attribute: "res", op: "add", value: -FREEZE_RES_DOWN }] : []
      },
    }),
    define({
      id: "cold",
      tags: [COLD],
      modifiers: [{ attribute: "aspd", op: "add", value: COLD_ASPD }],
      onApply(unitId, _stacks, ctx) {
        freezeFromCold(state, registry, ctx, unitId)
      },
    }),
    define({ id: "sleep", tags: [SLEEP, NO_BLOCK], cancels: attack, immune: "sleep" }),
    define({
      id: "slow",
      valued: 0.5,
      stacking: "strongest",
      scale: (value) => [{ attribute: "moveSpeed", op: "mul", value: 1 - clamp01(value) }],
    }),
    define({ id: "sluggish", modifiers: [{ attribute: "moveSpeed", op: "mul", value: 0.2 }] }),
    define({ id: "bind", tags: [BIND, NO_MOVE], modifiers: [{ attribute: "moveSpeed", op: "mul", value: 0 }] }),
    define({
      id: "fragile",
      valued: 0.3,
      stacking: "strongest",
      scale: (value) => [{ attribute: "dmgTaken", op: "mul", value: 1 + value }],
    }),
    define({
      id: "artsFragile",
      valued: 0.3,
      stacking: "strongest",
      scale: (value) => [{ attribute: "artsTaken", op: "mul", value: 1 + value }],
    }),
    define({
      id: "physFragile",
      valued: 0.3,
      stacking: "strongest",
      scale: (value) => [{ attribute: "physTaken", op: "mul", value: 1 + value }],
    }),
    define({
      id: "elemFragile",
      valued: 0.2,
      stacking: "strongest",
      scale: (value) => [{ attribute: "elementalTaken", op: "mul", value: 1 + value }],
    }),
    define({ id: "silence", tags: [SILENCE], cancels: attack, immune: "silence" }),
    define({ id: "fear", tags: [FEAR, UNBLOCKABLE], cancels: attack, immune: "feared" }),
    define({ id: "tremble", tags: [TREMBLE], immune: "feared" }),
    define({ id: "disarm", tags: [DISARM], cancels: attack }),
    define({ id: "stealth", tags: [STEALTH] }),
    define({ id: "stealthOff", tags: [STEALTH_OFF] }),
    define({ id: "overheal" }),
    define({ id: "camou", tags: [CAMOU] }),
    define({ id: "reveal", tags: [REVEAL] }),
    define({ id: "invulnerable", tags: [INVULNERABLE] }),
    define({
      id: "levitate",
      tags: [LEVITATE, STUN, UNBLOCKABLE, NO_DISPLACE],
      cancels: attack,
      immune: "levitate",
      onApply(unitId) {
        const unit = requireUnit(state, unitId)
        const status = unit.effects.find((item) => item.id === "levitate")
        if (!status || status.permanent) return
        if (!(attributeOf(unit, registry, "massLevel") > LEVITATE_HALF_WEIGHT)) return
        status.remaining /= 2
      },
    }),
    define({ id: "palsy", stackCap: PALSY_MAX, immune: "palsy", valued: 1, stacking: "stack" }),
    define({
      id: "taunt",
      valued: 1,
      stacking: "strongest",
      scale: (value) => [{ attribute: "taunt", op: "add", value }],
    }),
    define({
      id: "weaken",
      valued: 0.3,
      stacking: "strongest",
      scale: (value) => [{ attribute: "atk", op: "mul", value: 1 - clamp01(value) }],
    }),
    define({
      id: "aspdDown",
      valued: -30,
      stacking: "strongest",
      scale: (value) => [{ attribute: "aspd", op: "add", value }],
    }),
    define({
      id: "defDown",
      valued: 0.3,
      stacking: "strongest",
      scale: (value) => [{ attribute: "def", op: "mul", value: 1 - clamp01(value) }],
    }),
    define({
      id: "resDown",
      valued: 20,
      stacking: "strongest",
      scale: (value) => [{ attribute: "res", op: "add", value: -value }],
    }),
    define({ id: "unblockable", tags: [UNBLOCKABLE] }),
    define({ id: "attract", tags: [ATTRACT, UNBLOCKABLE] }),
    define({
      id: "resist",
      valued: RESIST_DEFAULT,
      stacking: "strongest",
      onTick(unitId) {
        const unit = requireUnit(state, unitId)
        const status = unit.effects.find((item) => item.id === "resist")
        if (!status) return
        status.pulse += 1
        if (DECAY_TICKS <= 0 || status.pulse % DECAY_TICKS !== 0) return
        const palsy = unit.effects.find((item) => item.id === "palsy" && !item.dropped)
        if (!palsy) return
        palsy.stacks -= 1
        if (palsy.stacks <= 0) dropEffect(registry, unit, "palsy")
      },
    }),
    define({ id: "liftoff", tags: [LIFTOFF] }),
    define({ id: "isolated", tags: [ISOLATED] }),
  ]
}

function freezeFromCold(state: BattleWorld, registry: BattleRegistry, ctx: ContentContext, unitId: string): void {
  const unit = requireUnit(state, unitId)
  const cold = unit.effects.find((item) => item.id === "cold")
  if (!cold?.carried || immuneTo(state, registry, unit, "freeze")) return
  const incoming = cold.permanent ? Number.POSITIVE_INFINITY : cold.remaining
  const spans = [cold.priorRemaining, incoming].filter(
    (time) => time === Number.POSITIVE_INFINITY || (Number.isFinite(time) && time > 0),
  )
  ctx.applyEffect(unitId, "freeze")
  const freeze = requireUnit(state, unitId).effects.find((item) => item.id === "freeze" && !item.dropped)
  if (!freeze) return
  if (spans.length === 0) {
    freeze.permanent = false
    freeze.remaining = ticks(COLD_FREEZE_DURATION)
    return
  }
  const longest = Math.max(...spans)
  if (!Number.isFinite(longest)) {
    freeze.permanent = true
    freeze.remaining = 0
    return
  }
  freeze.permanent = false
  freeze.remaining = longest
}

function resistOf(unit: UnitState): number {
  let best = 0
  for (const status of unit.effects) {
    if (status.dropped || status.id !== "resist") continue
    if (status.strength > best) best = status.strength
  }
  return Math.min(RESIST_CAP, best)
}

function ticks(seconds: number): number {
  return Math.max(0, Math.round(seconds / TICK))
}

function clamp01(value: number): number {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

function define(entry: {
  id: string
  tags?: readonly TagKey[]
  modifiers?: readonly AttributeModifier[]
  cancels?: readonly string[]
  stackCap?: number
  immune?: string
  valued?: number
  stacking?: string
  scale?: EffectDefinition["scale"]
  onApply?: EffectDefinition["onApply"]
  onTick?: EffectDefinition["onTick"]
}): EffectDefinition {
  const { id, tags, ...options } = entry
  return defineEffect(id, { ...(tags ? { grantsTags: tags } : {}), ...options })
}
