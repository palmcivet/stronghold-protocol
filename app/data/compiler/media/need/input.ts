import { formatAssetKey, type AssetKey, type AssetKind, type Need } from "arknights-assets-catalog"
import type { PathTable } from "arknights-assets-extractor"
import type { AudioIndex, VoiceLang } from "#compiler/media/need/audio-bank.js"

/** Research tables under `compiler/input/research/` that name the ids a pack needs. */
export interface ResearchTables {
  readonly ops03: unknown
  readonly enemies05: unknown
  readonly maps05: unknown
  readonly assets07: unknown
}

/** Everything a need builder reads. Gamedata-derived parts are null until their tables are in the extractor cache. */
export interface NeedContext {
  readonly research: ResearchTables
  readonly audio: AudioIndex | null
  readonly charword: unknown
  readonly arknightsAssets: PathTable
  readonly voice: PathTable
  readonly voiceLang: VoiceLang
  /** Voice slots to request; null requests every official slot. */
  readonly voiceSlots: readonly string[] | null
  /** Ids the season packets name, which the research tables may not: summons, extra enemies and boss handbook ids. */
  readonly packet: PacketIds
}

export interface PacketIds {
  readonly enemyIds: readonly string[]
  readonly tokenIds: readonly string[]
  /** Boss enemy id to the handbook id that names its icon and sounds. */
  readonly handbookOf: ReadonlyMap<string, string>
  /** Enemy id to the id of its battle model (`spine` of the enemy record), where they differ. */
  readonly spineOf: ReadonlyMap<string, string>
}

export type JsonRecord = Readonly<Record<string, unknown>>

export function recordOf(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {}
}

export function listOf(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : []
}

export function textOf(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

/** A need for `<kind>:<path>`. Throws `AssetKeyError` when the path is not a valid key path. */
export function needOf(kind: AssetKind, path: string, required: boolean): Need {
  return { key: formatAssetKey(kind, path), required }
}

/** One need per key; a key listed as required anywhere stays required. Keeps the order of first appearance. */
export function uniqueNeeds(needs: readonly Need[]): Need[] {
  const byKey = new Map<AssetKey, Need>()
  for (const need of needs) {
    const previous = byKey.get(need.key)
    byKey.set(need.key, previous ? { key: need.key, required: previous.required || need.required } : need)
  }
  return [...byKey.values()]
}

/** Path-table keys that start with one of the prefixes, each as an optional need. */
export function tableNeeds(table: PathTable, prefixes: readonly string[]): Need[] {
  const out: Need[] = []
  for (const key of table.keys()) {
    if (prefixes.some((prefix) => key.startsWith(prefix))) out.push({ key, required: false })
  }
  return out
}

/** File name of a sound path without its directories and extension, as used by `sfx/<group>/<name>` keys. */
export function soundName(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1)
  return name.replace(/\.mp3$/i, "").replace(/[^A-Za-z0-9_-]/g, "_")
}

/** Sound keys a path list needs: at most the first four files, as the battle client plays them. */
export function soundNeeds(paths: readonly string[] | null | undefined, group: string): Need[] {
  return (paths ?? []).slice(0, 4).map((path) => needOf("audio", `sfx/${group}/${soundName(path)}`, false))
}
