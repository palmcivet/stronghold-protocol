import type { AttributeModifier } from "arknights-mission-core"
import type { PacketData } from "#server/entry/packet.js"
import {
  asRecord,
  buffsOf,
  directMods,
  effectRecord,
  gameData,
  isShopItem,
  modifiersFromLegacy,
  num,
} from "#server/content/support/record.js"

const BOUNTY_KEYS = ["add_enemy_kill_gain_coin", "add_enemy_selfbattle_win_gain_coin", "next_battle_add_enemy_win_gain_coin"] as const

export const CHOICE_KEYS = {
  gainEquip: "global_special_choice_gain_equip",
  addLayer: "global_special_choice_bond_addlayer",
  gainCoin: "global_special_choice_gain_coin",
  freeRefresh: "global_special_choice_refresh_free",
  goldenItem: "single_special_choice_gloden_equip_chess",
  eliteChess: "single_special_choice_gloden_char_chess",
  bondChess: "single_special_choice_gain_bond_chess",
  map: "auto_chess_change_map",
  always: "global_special_choice_all_activated",
  benchAtLeast: "global_special_choice_prep_finish_bench_at_least",
  benchAtMost: "global_special_choice_prep_finish_bench_at_most",
  sameRow: "global_special_choice_prep_finish_same_row_at_least",
} as const

const PREP_KEYS = new Set<string>([
  CHOICE_KEYS.gainEquip,
  CHOICE_KEYS.addLayer,
  CHOICE_KEYS.gainCoin,
  CHOICE_KEYS.freeRefresh,
  CHOICE_KEYS.goldenItem,
  CHOICE_KEYS.eliteChess,
  CHOICE_KEYS.bondChess,
])

const GATE_KEYS = new Set<string>([
  CHOICE_KEYS.always,
  CHOICE_KEYS.benchAtLeast,
  CHOICE_KEYS.benchAtMost,
  CHOICE_KEYS.sameRow,
])

const HEAL_RUNE = "act1autochess_debuff_3"
const FLAWLESS_RUNE = "act1autochess_debuff_9"

export const BUILTIN_REFS: Readonly<Record<string, string>> = {
  goldenItem: "effect:builtin_next_buy_golden_item",
  eliteChess: "effect:builtin_next_buy_elite",
}

export interface ChoiceGate {
  readonly kind: "always" | "benchAtLeast" | "benchAtMost" | "sameRow"
  readonly count: number
}

export interface ChoiceCardIds {
  readonly bounty: readonly string[]
  readonly tactic: readonly string[]
  readonly items: readonly string[]
}

function int(value: unknown, fallback = 0): number {
  const parsed = num(value, Number.NaN)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback
}

export function choiceCardIds(data: PacketData = gameData()): ChoiceCardIds {
  const bounty: string[] = []
  const tactic: string[] = []
  const effects = asRecord(data.effects) ?? {}
  for (const [id, value] of Object.entries(effects)) {
    const effect = asRecord(value)
    if (!effect) continue
    if (effect.effectType === "ENEMY_GAIN") bounty.push(id)
    else if (effect.effectType === "BUFF_GAIN") tactic.push(id)
  }
  const cards = asRecord(asRecord(data.choices)?.cards)
  for (const entry of Array.isArray(cards?.bounty) ? cards.bounty : []) {
    const card = asRecord(entry)
    if (card && typeof card.effectId === "string" && !bounty.includes(card.effectId)) bounty.push(card.effectId)
  }
  for (const entry of Array.isArray(cards?.tactic) ? cards.tactic : []) {
    const card = asRecord(entry)
    if (card && typeof card.effectId === "string" && !tactic.includes(card.effectId)) tactic.push(card.effectId)
  }
  const items: string[] = []
  const table = asRecord(data.items) ?? {}
  for (const [id, value] of Object.entries(table)) if (isShopItem(value)) items.push(id)
  bounty.sort()
  tactic.sort()
  items.sort()
  return { bounty, tactic, items }
}

export interface BountySpec {
  readonly effectId: string | null
  readonly name: string
  readonly desc: string
  readonly tier: number
  readonly coin: number
  readonly payout: "kill" | "perfect"
  readonly rounds: number
  readonly multiRound: boolean
  readonly enemyKey: string
  readonly count: number
}

export function bountyOf(effect: unknown, card: unknown = null): BountySpec | null {
  const record = asRecord(effect)
  if (!record || !Array.isArray(record.buffs)) return null
  const list = record.buffs
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => {
      if (!entry || typeof entry.key !== "string") return false
      const bbStr = asRecord(entry.bbStr)
      return (BOUNTY_KEYS as readonly string[]).includes(entry.key) && typeof bbStr?.enemy_id === "string"
    })
  if (!list.length) return null
  list.sort((left, right) => BOUNTY_KEYS.indexOf(left.key as (typeof BOUNTY_KEYS)[number]) - BOUNTY_KEYS.indexOf(right.key as (typeof BOUNTY_KEYS)[number]))
  const first = list[0]
  if (!first) return null
  const bb = asRecord(first.bb) ?? {}
  const bbStr = asRecord(first.bbStr)
  const enemyKey = typeof bbStr?.enemy_id === "string" ? bbStr.enemy_id : ""
  const cardRecord = asRecord(card)
  const coin = Math.max(0, int(bb.coin, int(record.enemyPrice, 0)))
  const rounds = first.key === "next_battle_add_enemy_win_gain_coin" ? 1 : Math.max(1, Math.min(99, int(bb.round, 1)))
  const tier = cardRecord && Number.isInteger(cardRecord.tier) ? Number(cardRecord.tier) : Math.max(1, Math.min(3, coin || 1))
  return {
    effectId: typeof record.effectId === "string" ? record.effectId : null,
    name: typeof record.name === "string" ? record.name : typeof cardRecord?.name === "string" ? cardRecord.name : "悬赏",
    desc: typeof record.desc === "string" ? record.desc : typeof cardRecord?.desc === "string" ? cardRecord.desc : "",
    tier,
    coin,
    payout: first.key === "add_enemy_kill_gain_coin" ? "kill" : "perfect",
    rounds,
    multiRound: rounds > 1,
    enemyKey,
    count: Math.max(1, int(bb.count, 1)),
  }
}

export function mapAliases(effect: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  for (const buff of buffsOf(effect)) {
    if (buff.key !== CHOICE_KEYS.map) continue
    for (const [key, value] of Object.entries(buff.params)) {
      if (key.includes("#")) out[key] = num(value, 0) !== 0 ? 1 : 0
    }
  }
  return out
}

export function gateOf(effect: unknown): ChoiceGate {
  for (const buff of buffsOf(effect)) {
    if (buff.key === CHOICE_KEYS.benchAtLeast) return { kind: "benchAtLeast", count: Math.max(0, int(buff.params.count, 0)) }
    if (buff.key === CHOICE_KEYS.benchAtMost) return { kind: "benchAtMost", count: Math.max(0, int(buff.params.count, 0)) }
    if (buff.key === CHOICE_KEYS.sameRow) return { kind: "sameRow", count: Math.max(1, int(buff.params.count, 3)) }
  }
  return { kind: "always", count: 0 }
}

export function benchGate(gate: ChoiceGate | null, count: number): boolean {
  if (!gate) return true
  if (gate.kind === "benchAtLeast") return count >= gate.count
  if (gate.kind === "benchAtMost") return count <= gate.count
  return true
}

export function hasBattlePart(effect: unknown): boolean {
  return buffsOf(effect).some((buff) => !!buff.key && !PREP_KEYS.has(buff.key) && !GATE_KEYS.has(buff.key))
}

function opModifiers(params: Record<string, unknown>): AttributeModifier[] {
  const direct = { atk: 0, def: 0, hp: 0 }
  const legacy: Record<string, number> = {}
  const add = (key: string, value: number) => {
    legacy[key] = (legacy[key] ?? 0) + value
  }
  for (const [key, raw] of Object.entries(params)) {
    const value = num(raw, Number.NaN)
    if (!Number.isFinite(value)) continue
    switch (key) {
      case "magic_resist_penetrate_fixed":
        add("resIgnoreFlat", value)
        break
      case "magic_resist_penetrate":
        add("resIgnorePct", value)
        break
      case "def_penetrate":
        add("defIgnorePct", value)
        break
      case "def_penetrate_fixed":
        add("defIgnoreFlat", value)
        break
      case "atk":
        direct.atk += value
        break
      case "def":
        direct.def += value
        break
      case "max_hp":
        direct.hp += value
        break
      case "attack_speed":
        add("aspd", Math.abs(value) < 1 ? value * 100 : value)
        break
      case "damage_scale":
        legacy.dmgDealtMul = (legacy.dmgDealtMul ?? 1) * (1 + value)
        break
      default:
        break
    }
  }
  return directMods(direct, modifiersFromLegacy(legacy))
}

function enemyModifiers(params: Record<string, unknown>, multiply: boolean): AttributeModifier[] {
  const legacy: Record<string, number> = {}
  for (const [key, raw] of Object.entries(params)) {
    const value = num(raw, Number.NaN)
    if (!Number.isFinite(value) || key === "enemy_level_type") continue
    if (multiply) {
      if (key === "attack_speed") {
        if (value !== 1) legacy.aspd = (legacy.aspd ?? 0) + (value - 1) * 100
        continue
      }
      const name = key === "max_hp" ? "hpMul" : key === "magic_resistance" ? "resMul" : key === "move_speed" ? "moveMul" : key === "atk" ? "atkMul" : key === "def" ? "defMul" : ""
      if (name && value > 0 && value !== 1) legacy[name] = (legacy[name] ?? 1) * value
    } else {
      const name = key === "max_hp" ? "hpFlat" : key === "magic_resistance" ? "resFlat" : key === "move_speed" ? "moveFlat" : key === "atk" ? "atkFlat" : key === "def" ? "defFlat" : key === "attack_speed" ? "aspd" : ""
      if (name && value !== 0) legacy[name] = (legacy[name] ?? 0) + value
    }
  }
  return modifiersFromLegacy(legacy)
}

export interface EnemyPlan {
  readonly rank: string | null
  readonly modifiers: readonly AttributeModifier[]
}

export interface ChoiceBattlePlan {
  readonly effectId: string
  readonly key: string
  readonly gate: ChoiceGate
  readonly heal: number
  readonly flawless: readonly AttributeModifier[] | null
  readonly operators: readonly AttributeModifier[]
  readonly enemies: readonly EnemyPlan[]
}

export interface ChoiceRef {
  readonly id?: string
  readonly key?: string
  readonly params?: Readonly<Record<string, unknown>>
  readonly data?: Readonly<Record<string, unknown>>
}

export function battlePlanOf(ref: ChoiceRef | null | undefined): ChoiceBattlePlan | null {
  const fromData = ref?.data && typeof ref.data.effectId === "string" ? ref.data.effectId : null
  const fromKey = ref?.key?.startsWith("choice:") ? ref.key.slice("choice:".length) : null
  const effectId = fromData ?? fromKey
  if (!effectId) return null
  const effect = effectRecord(effectId)
  if (!effect) return null
  const key = typeof ref?.id === "string" && ref.id.startsWith(`choice:${effectId}#`) ? ref.id : `choice:${effectId}#${ref?.id ?? ""}`
  let heal = 0
  let flawless: readonly AttributeModifier[] | null = null
  const operators: AttributeModifier[] = []
  const enemies: EnemyPlan[] = []
  for (const buff of buffsOf(effect)) {
    if (!buff.key || PREP_KEYS.has(buff.key) || GATE_KEYS.has(buff.key) || buff.key === CHOICE_KEYS.map) continue
    if (buff.key === "env_gbuff_new" || buff.key === "env_gbuff_new_with_verify") {
      if (buff.bbKey === HEAL_RUNE) heal += Math.max(0, num(buff.params.value, 0))
      else if (buff.bbKey === FLAWLESS_RUNE) flawless = opModifiers({ atk: buff.params.atk, def: buff.params.def })
      else operators.push(...opModifiers(buff.params))
    } else if (buff.key === "char_respawntime_mul") {
      const scale = num(buff.params.scale, Number.NaN)
      if (Number.isFinite(scale) && scale >= 0) operators.push({ attribute: "redeployMul", op: "mul", value: scale })
    } else if (buff.key === "enemy_attribute_mul" || buff.key === "enemy_attribute_add") {
      const modifiers = enemyModifiers(buff.params, buff.key === "enemy_attribute_mul")
      const rank = typeof buff.params.enemy_level_type === "string" && buff.params.enemy_level_type
        ? buff.params.enemy_level_type.toUpperCase()
        : null
      if (modifiers.length) enemies.push({ rank, modifiers })
    }
  }
  if (!(heal > 0) && !flawless && !operators.length && !enemies.length) return null
  return { effectId, key, gate: gateOf(effect), heal, flawless, operators, enemies }
}

export function cardRecord(data: PacketData, family: string, id: string): Record<string, unknown> | null {
  const cards = asRecord(asRecord(data.choices)?.cards)
  const list = cards && Array.isArray(cards[family]) ? cards[family] : []
  for (const entry of list) {
    const card = asRecord(entry)
    if (card && card.effectId === id) return card
  }
  return null
}

export function effectOf(data: PacketData, id: string): Record<string, unknown> | null {
  const effects = asRecord(data.effects)
  const found = effects ? asRecord(effects[id]) : null
  return found ?? effectRecord(id)
}
