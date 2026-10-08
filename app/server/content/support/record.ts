import type { AttributeModifier } from "arknights-mission-core"
import { getBand, getBond, getData, getEffect, getItem, lookup, type PacketData } from "#server/entry/packet.js"

/** Finite number from a number or a numeric string, otherwise `fallback`. */
export function num(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(+value)) return +value
  return fallback
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>
  return null
}

let packet: PacketData | null = null
let cores: Set<string> | null = null

/** Frozen season packet. */
export function gameData(): PacketData {
  if (!packet) packet = getData()
  return packet
}

/** Tests replace the packet. `null` reloads the process packet. */
export function setGameData(next: PacketData | null): void {
  packet = next
  cores = null
}

export function bondRecord(id: string): Record<string, unknown> | null {
  return getBond(id, gameData())
}

export function itemRecord(id: string): Record<string, unknown> | null {
  return getItem(id, gameData())
}

export function bandRecord(id: string): Record<string, unknown> | null {
  return getBand(id, gameData())
}

export function effectRecord(id: string): Record<string, unknown> | null {
  return getEffect(id, gameData())
}

export function tableRecord(data: PacketData, table: string, id: string): Record<string, unknown> | null {
  return lookup(table, id, data)
}

/** Item id without the `_a` / `_b` suffix. */
export function itemKeyOf(id: unknown): string {
  return String(id ?? "").replace(/_[ab]$/, "")
}

export function isGoldenId(id: unknown): boolean {
  return /_b$/.test(String(id ?? ""))
}

export interface BuffParts {
  readonly key: string | null
  readonly bbKey: string | null
  readonly params: Record<string, unknown>
}

export function buffsOf(record: unknown): BuffParts[] {
  const rec = asRecord(record)
  const list = rec && Array.isArray(rec.buffs) ? rec.buffs : []
  const out: BuffParts[] = []
  for (const entry of list) {
    const buff = asRecord(entry)
    if (!buff) continue
    const bb = asRecord(buff.bb) ?? {}
    const bbStr = asRecord(buff.bbStr) ?? {}
    const key = typeof buff.key === "string" ? buff.key : null
    const bbKey = typeof bbStr.key === "string" ? bbStr.key : null
    out.push({ key, bbKey, params: { ...bb, ...bbStr } })
  }
  return out
}

/** Merged blackboard of the first buff whose key or bbStr key matches. */
export function buffParams(record: unknown, key: string | RegExp): Record<string, unknown> | null {
  for (const buff of buffsOf(record)) {
    const hit = key instanceof RegExp
      ? key.test(buff.key ?? "") || key.test(buff.bbKey ?? "")
      : buff.key === key || buff.bbKey === key
    if (hit) return buff.params
  }
  return null
}

export function coreBondIds(): ReadonlySet<string> {
  if (!cores) {
    cores = new Set()
    const bonds = asRecord(gameData().bonds)
    if (bonds) {
      for (const [id, value] of Object.entries(bonds)) {
        const bond = asRecord(value)
        if (bond?.isCore === true) cores.add(id)
      }
    }
  }
  return cores
}

export function isCoreBond(id: string): boolean {
  return coreBondIds().has(id)
}

export function isShopItem(record: unknown): boolean {
  const item = asRecord(record)
  return !!item
    && item.isGolden !== true
    && item.hideInShop !== true
    && item.shopExcluded !== true
    && item.itemType === "EQUIP"
    && Number.isInteger(item.tier)
}

/** Direct-multiply ratios (`+0.3` is +30%) written as percent modifiers. */
export function directMods(
  ratios: { readonly atk?: number; readonly def?: number; readonly hp?: number },
  extra: readonly AttributeModifier[] = [],
): AttributeModifier[] {
  const out: AttributeModifier[] = []
  const put = (attribute: string, value: number | undefined) => {
    if (typeof value !== "number" || !Number.isFinite(value) || value === 0) return
    out.push({ attribute, op: "percent", value })
  }
  put("atk", ratios.atk)
  put("def", ratios.def)
  put("hp", ratios.hp)
  return out.concat(extra)
}

const ADD: Readonly<Record<string, string>> = {
  atkPct: "atk",
  defPct: "def",
  hpPct: "hp",
  atkFlat: "atk",
  defFlat: "def",
  hpFlat: "hp",
  aspd: "aspd",
  resIgnoreFlat: "resIgnoreFlat",
  resIgnorePct: "resIgnorePct",
  defIgnoreFlat: "defIgnoreFlat",
  defIgnorePct: "defIgnorePct",
  resFlat: "res",
  moveFlat: "moveSpeed",
}

const MUL: Readonly<Record<string, string>> = {
  atkMul: "atk",
  defMul: "def",
  hpMul: "hp",
  resMul: "res",
  moveMul: "moveSpeed",
  dmgDealtMul: "dmgDealt",
  redeployMul: "redeployMul",
}

/** Buff-mod map (`atkPct`, `atkMul`, …) as port modifiers. */
export function modifiersFromBuffMods(mods: Readonly<Record<string, number>>): AttributeModifier[] {
  const out: AttributeModifier[] = []
  for (const [key, value] of Object.entries(mods)) {
    if (!Number.isFinite(value) || value === 0) continue
    const add = ADD[key]
    if (add) {
      out.push({ attribute: add, op: key.endsWith("Pct") ? "percent" : "add", value })
      continue
    }
    const mul = MUL[key]
    if (mul) out.push({ attribute: mul, op: "mul", value })
  }
  return out
}
