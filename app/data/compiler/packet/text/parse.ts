import type { BuildNotes } from "./notes.js"

/** Official and compiled records. Builders read these dynamically. */
export type GameRecord = Record<string, any>

export function cleanNum(value: any): any {
  if (typeof value !== "number" || !Number.isFinite(value)) return value
  if (Number.isInteger(value) || Math.abs(value) >= 1e6) return value
  return Math.round(value * 1e6) / 1e6
}

function unescapeNewlines(value: any): any {
  return typeof value === "string" ? value.replace(/\\n/g, "\n") : value
}

/** Drop official markup (`<@…>`, `<$…>`, `<#…>`, color, bold, italic) and keep trigger labels such as `<获得时>`. */
export function stripRich(value: any): any {
  if (typeof value !== "string") return value ?? null
  return unescapeNewlines(value)
    .replace(/<[@$#][^<>]*>/g, "")
    .replace(/<\/>/g, "")
    .replace(/<\/?color[^<>]*>/gi, "")
    .replace(/<\/?[bi]>/gi, "")
}

export function richRaw(value: any): any {
  return typeof value === "string" ? unescapeNewlines(value) : value ?? null
}

export function pointOf(position: any): any {
  return position ? [position.row, position.col] : null
}

export function listOf(value: any): any[] {
  return Array.isArray(value) ? value : Object.values(value || {})
}

/** Flatten `[{key,value,valueStr}]`. Duplicate keys become `key_1`, `key_2`, …. A string entry keeps a numeric 0 out of `bb`. */
export function flattenBB(list: any, label: string, notes: BuildNotes): { bb: GameRecord, bbStr: GameRecord } {
  const bb: GameRecord = {}
  const bbStr: GameRecord = {}
  for (const entry of Array.isArray(list) ? list : []) {
    if (!entry || typeof entry.key !== "string") continue
    let key = entry.key
    const taken = (name: string): boolean => Object.prototype.hasOwnProperty.call(bb, name) || Object.prototype.hasOwnProperty.call(bbStr, name)
    if (taken(key)) {
      let index = 1
      while (taken(`${entry.key}_${index}`)) index++
      key = `${entry.key}_${index}`
      if (label) notes.warn(`duplicate blackboard key ${entry.key} in ${label} (stored as ${key})`)
    }
    const num = cleanNum(typeof entry.value === "number" ? entry.value : Number(entry.value) || 0)
    const hasStr = entry.valueStr != null && entry.valueStr !== ""
    if (!hasStr || num !== 0) bb[key] = num
    if (hasStr) bbStr[key] = String(entry.valueStr)
  }
  return { bb, bbStr }
}

function formatValue(value: any, format: string | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return String(value)
  if (!format) return String(cleanNum(value))
  const percent = format.endsWith("%")
  const core = percent ? format.slice(0, -1) : format
  const fraction = core.includes(".") ? core.split(".")[1] : undefined
  const decimals = fraction ? fraction.length : 0
  const scaled = percent ? value * 100 : value
  const rounded = Math.sign(scaled) * Math.round(Math.abs(scaled) * 10 ** decimals + 1e-9) / 10 ** decimals
  return rounded.toFixed(decimals) + (percent ? "%" : "")
}

export function resolvePlaceholders(text: any, bb: any, bbStr: any, label: string, notes: BuildNotes): any {
  if (typeof text !== "string") return text ?? null
  const lower = new Map<string, any>()
  for (const [key, value] of Object.entries(bb || {})) lower.set(key.toLowerCase(), value)
  const lowerStr = new Map<string, any>()
  for (const [key, value] of Object.entries(bbStr || {})) lowerStr.set(key.toLowerCase(), value)
  return text.replace(/\{(-?)([^{}:]+)(?::([^{}]+))?\}/g, (match: string, neg: string, key: string, format?: string) => {
    const name = key.trim().toLowerCase()
    if (lowerStr.has(name) && (!lower.has(name) || !format)) return lowerStr.get(name)
    if (lower.has(name)) {
      const value = lower.get(name)
      return formatValue(neg ? -value : value, format)
    }
    if (label) notes.warn(`unresolved placeholder ${match} in ${label}`)
    return match
  })
}

/** `{desc, descRaw}` after placeholder substitution. Without a blackboard the markup is only unescaped. */
export function textPair(raw: any, notes: BuildNotes, bb?: any, bbStr?: any, label?: string): { desc: any, descRaw: any } {
  const resolved = bb ? resolvePlaceholders(richRaw(raw), bb, bbStr, label ?? "", notes) : richRaw(raw)
  return { desc: stripRich(resolved), descRaw: resolved }
}

export function naturalCmp(a: unknown, b: unknown): number {
  return String(a).localeCompare(String(b), "en", { numeric: true })
}

const PHASE_INDEX: Readonly<Record<string, number>> = { PHASE_0: 0, PHASE_1: 1, PHASE_2: 2 }

export function phaseIdx(phase: unknown): number {
  if (typeof phase === "number") return phase
  if (typeof phase !== "string") return 0
  return PHASE_INDEX[phase] ?? 0
}

export function unlocked(cond: any, phase: number, level: number, potRank = 0, reqPot = 0): boolean {
  if ((reqPot || 0) > potRank) return false
  if (!cond) return true
  const phaseNeed = phaseIdx(cond.phase)
  if (phaseNeed < phase) return true
  if (phaseNeed > phase) return false
  return (cond.level || 1) <= level
}

export function bestCandidate(candidates: any, phase: number, level: number): any {
  let best: any = null
  for (const candidate of candidates || []) {
    if (candidate && unlocked(candidate.unlockCondition, phase, level, 0, candidate.requiredPotentialRank)) best = candidate
  }
  return best
}

const LEVEL_ID: RegExp = /level_([A-Za-z0-9_]+)$/

export function templateIdOf(levelId: unknown): string {
  const match = LEVEL_ID.exec(String(levelId))
  const id = match?.[1]
  if (!id) throw new Error(`bad levelId ${levelId}`)
  return id.toLowerCase()
}

/** Cache path of a level file. Accepts an official levelId or a plain stage id. */
export function levelPath(idOrLevelId: unknown): string {
  const text = String(idOrLevelId)
  if (text.includes("/")) {
    const dir = text.slice(0, text.lastIndexOf("/")).toLowerCase()
    return `levels/${dir}/level_${templateIdOf(text)}.json`
  }
  const season = text.split("_")[0] ?? text
  return `levels/activities/${season}/level_${text.toLowerCase()}.json`
}
