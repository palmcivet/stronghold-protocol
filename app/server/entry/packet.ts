import fs from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"

const require = createRequire(import.meta.url)

function dataPackageRoot(): string {
  return path.dirname(require.resolve("@alliance/data/package.json"))
}

/** Compiled season packet the process reads when no directory is given. */
export const DEFAULT_PACKET_DIR: string = path.resolve(
  process.env.SP_DATA_DIR || path.join(dataPackageRoot(), "product/season/act2autochess"),
)

export const DATA_FILES: readonly string[] = Object.freeze([
  "config", "tuning", "chess", "bonds", "garrisons", "items", "bands", "effects", "choices",
  "enemies", "factions", "waves", "stages", "bosses", "tokens", "assets",
])

export type PacketData = Readonly<Record<string, unknown>>

export interface DataLog {
  warn?(message: string): void
  error?(message: string): void
  info?(message: string): void
}

export function deepFreeze<T>(root: T): T {
  const stack: unknown[] = [root]
  const seen = new Set<object>()
  while (stack.length) {
    const value = stack.pop()
    if (value === null || typeof value !== "object" || seen.has(value)) continue
    seen.add(value)
    for (const child of Object.values(value)) {
      if (child !== null && typeof child === "object") stack.push(child)
    }
    Object.freeze(value)
  }
  return root
}

export function loadData(dir: string = DEFAULT_PACKET_DIR, options: { log?: DataLog; expected?: readonly string[] } = {}): PacketData {
  const log = options.log ?? console
  const expected = options.expected ?? DATA_FILES
  const out: Record<string, unknown> = {}
  let names: string[] = []
  try {
    names = fs.readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
      .map((entry) => entry.name)
      .sort()
  } catch (cause) {
    const error = cause as NodeJS.ErrnoException
    log.warn?.(`[data] cannot read ${dir}: ${error.code || error.message} — running without game data`)
  }
  for (const file of names) {
    const key = file.slice(0, -".json".length)
    try {
      out[key] = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as unknown
    } catch (cause) {
      const error = cause as Error
      log.error?.(`[data] skipping ${file}: ${error.message}`)
    }
  }
  const missing = expected.filter((key) => !(key in out))
  if (missing.length) log.warn?.(`[data] missing data files: ${missing.map((key) => `${key}.json`).join(", ")}`)
  return deepFreeze(out)
}

let singleton: PacketData | null = null

export function getData(options: { dir?: string; log?: DataLog } = {}): PacketData {
  if (!singleton) singleton = loadData(options.dir ?? DEFAULT_PACKET_DIR, { log: options.log ?? console })
  return singleton
}

export function resetData(): void {
  singleton = null
}

export const INDEXED_FILES: Readonly<Record<string, string>> = Object.freeze({
  chess: "getChess",
  bonds: "getBond",
  garrisons: "getGarrison",
  items: "getItem",
  bands: "getBand",
  effects: "getEffect",
  enemies: "getEnemy",
  waves: "getWave",
  stages: "getStage",
  bosses: "getBoss",
  tokens: "getToken",
})

function ownRecord(map: unknown, id: unknown): Record<string, unknown> | null {
  if (typeof id !== "string" || id.length === 0) return null
  if (!map || typeof map !== "object" || Array.isArray(map) || !Object.hasOwn(map, id)) return null
  const record = (map as Record<string, unknown>)[id]
  return record !== null && typeof record === "object" ? record as Record<string, unknown> : null
}

export function lookup(file: string, id: unknown, data: PacketData = getData()): Record<string, unknown> | null {
  if (!data || typeof data !== "object" || !Object.hasOwn(data, file)) return null
  return ownRecord(data[file], id)
}

export const getChess = (id: unknown, data?: PacketData): Record<string, unknown> | null => lookup("chess", id, data ?? getData())
export const getBond = (id: unknown, data?: PacketData): Record<string, unknown> | null => lookup("bonds", id, data ?? getData())
export const getGarrison = (id: unknown, data?: PacketData): Record<string, unknown> | null => lookup("garrisons", id, data ?? getData())
export const getItem = (id: unknown, data?: PacketData): Record<string, unknown> | null => lookup("items", id, data ?? getData())
export const getBand = (id: unknown, data?: PacketData): Record<string, unknown> | null => lookup("bands", id, data ?? getData())
export const getEffect = (id: unknown, data?: PacketData): Record<string, unknown> | null => lookup("effects", id, data ?? getData())
export const getEnemy = (id: unknown, data?: PacketData): Record<string, unknown> | null => lookup("enemies", id, data ?? getData())
export const getWave = (id: unknown, data?: PacketData): Record<string, unknown> | null => lookup("waves", id, data ?? getData())
export const getStage = (id: unknown, data?: PacketData): Record<string, unknown> | null => lookup("stages", id, data ?? getData())
export const getBoss = (id: unknown, data?: PacketData): Record<string, unknown> | null => lookup("bosses", id, data ?? getData())
export const getToken = (id: unknown, data?: PacketData): Record<string, unknown> | null => lookup("tokens", id, data ?? getData())

export function getConfig(data: PacketData = getData()): Record<string, unknown> | null {
  const config = Object.hasOwn(data, "config") ? data.config : null
  return config !== null && typeof config === "object" && !Array.isArray(config) ? config as Record<string, unknown> : null
}

export function getMode(modeId: unknown, data: PacketData = getData()): Record<string, unknown> | null {
  const config = getConfig(data)
  if (!config) return null
  return ownRecord(config.modes, modeId)
}
