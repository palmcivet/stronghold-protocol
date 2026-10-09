// 动画角色表：每个 Spine 模型的动画名按角色（待机、攻击、技能、死亡等）归类。输入是提取出的 Spine 侧车与数据包所用的技能下标。

import { createHash } from "node:crypto"
import { formatAssetKey, isSpineMeta, parseAssetKey, type AssetKey, type RawCatalog, type RawEntry, type SpineMeta } from "arknights-assets-catalog"
import { listOf, recordOf } from "#compiler/media/need/input.js"
import { resolveRoles, type AnimRoles } from "#compiler/media/spine/anim-role.js"

/** Source id recorded in the raw catalog of derived files. */
export const DERIVED_SOURCE_ID = "app-data"

/** Key of the animation roles of one season: `json:anim-roles/<seasonId>`. */
export function animRolesKey(seasonId: string): AssetKey {
  return formatAssetKey("json", `anim-roles/${seasonId}`)
}

/** Skill indices by operator id, from the operator table: the default skill first, then the other skills in order. */
export function skillIndicesByOperator(ops03: unknown): Map<string, number[]> {
  const primary = new Map<string, number>()
  const all = new Map<string, Set<number>>()
  const add = (id: unknown, index: unknown, isPrimary: boolean): void => {
    if (typeof id !== "string" || typeof index !== "number" || !Number.isInteger(index) || index < 0) return
    let set = all.get(id)
    if (!set) {
      set = new Set()
      all.set(id, set)
    }
    set.add(index)
    if (isPrimary && !primary.has(id)) primary.set(id, index)
  }
  const chess = listOf(recordOf(ops03)["chess"])
  for (const item of chess) {
    const row = recordOf(item)
    if (row["charId"]) add(row["charId"], row["defaultSkillIndex"], row["isGolden"] !== true)
  }
  for (const item of chess) {
    const backup = recordOf(recordOf(item)["backup"])
    if (backup["charId"]) add(backup["charId"], backup["skillIndex"], true)
  }
  const out = new Map<string, number[]>()
  for (const [id, set] of all) {
    const first = primary.has(id) ? primary.get(id) : Math.min(...set)
    if (first === undefined) continue
    out.set(id, [first, ...[...set].filter((index) => index !== first).sort((a, b) => a - b)])
  }
  return out
}

/** Skill indices a spine model is resolved with: operators by their skills, every other model by its first skill. */
function skillIndicesOf(key: AssetKey, operators: ReadonlyMap<string, number[]>): number[] {
  const { segments } = parseAssetKey(key)
  if (segments[0] === "char" && segments[1]) return operators.get(segments[1]) ?? [0]
  return [0]
}

export interface AnimRolesInput {
  readonly seasonId: string
  /** Spine keys of the catalog, in any order. */
  readonly spineKeys: readonly AssetKey[]
  readonly ops03: unknown
  /** Reads the Spine side file of a spine key; null when it is not in the catalog. */
  readonly readMeta: (key: AssetKey) => Promise<unknown | null>
}

export interface AnimRolesResult {
  readonly roles: Readonly<Record<string, AnimRoles>>
  /** Spine keys whose side file is missing or invalid. */
  readonly skipped: readonly AssetKey[]
}

/** Resolves the animation roles of every spine model that has a valid side file. */
export async function deriveAnimRoles(input: AnimRolesInput): Promise<AnimRolesResult> {
  const operators = skillIndicesByOperator(input.ops03)
  const roles: Record<string, AnimRoles> = {}
  const skipped: AssetKey[] = []
  for (const key of [...input.spineKeys].sort()) {
    const meta: unknown = await input.readMeta(key)
    if (meta === null || !isSpineMeta(meta)) {
      skipped.push(key)
      continue
    }
    roles[key] = resolveRoles(Object.keys(meta.animations), {
      skillIndices: skillIndicesOf(key, operators),
      durations: durationsOf(meta),
    })
  }
  return { roles, skipped }
}

function durationsOf(meta: SpineMeta): Record<string, number> {
  return Object.fromEntries(Object.entries(meta.animations).map(([name, animation]) => [name, animation.duration]))
}

/** Serialized form of a derived JSON file: sorted keys, one trailing newline. */
export function derivedJsonText(value: unknown): string {
  return `${JSON.stringify(sortKeys(value), null, 2)}\n`
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((name) => [name, sortKeys((value as Record<string, unknown>)[name])]),
    )
  }
  return value
}

/** Raw catalog entry of one derived JSON file, with the hash and size of the bytes written for it. */
export function derivedEntry(key: AssetKey, bytes: Uint8Array, source: string): RawEntry {
  return {
    key,
    kind: "json",
    files: [{ role: "main", name: null, format: "json", bytes: bytes.byteLength, hash: createHash("sha256").update(bytes).digest("hex") }],
    dependsOn: [],
    source: { id: DERIVED_SOURCE_ID, path: source, revision: null },
  }
}

/** A raw catalog that lists only derived files. */
export function derivedCatalog(entries: readonly RawEntry[]): RawCatalog {
  return {
    schemaVersion: 1,
    entries: Object.fromEntries(entries.map((entry) => [entry.key, entry])) as RawCatalog["entries"],
    missing: [],
  }
}
