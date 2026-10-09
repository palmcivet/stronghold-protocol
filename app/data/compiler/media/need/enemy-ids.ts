import { listOf, recordOf, textOf, type JsonRecord } from "#compiler/media/need/input.js"

/** Enemy models that the upstream has under another id; the first alias that exists is used. */
export const ENEMY_SPINE_ALIAS: Readonly<Record<string, string>> = Object.freeze({
  enemy_1305_mhslim: "enemy_1007_slime",
  enemy_1305_mhslim_2: "enemy_1007_slime",
})

const ENEMY_ID = /^enemy_\d+_[a-z0-9_]+$/i

export interface EnemyIdSources {
  readonly assets07: unknown
  readonly enemies05: unknown
  readonly maps05: unknown
  readonly ops03: unknown
}

function field(value: unknown, key: string): unknown {
  return recordOf(value)[key]
}

/** Every string `key` field under a value, at any depth. */
function walkKeys(node: unknown, add: (key: string) => void): void {
  if (Array.isArray(node)) {
    for (const item of node) walkKeys(item, add)
    return
  }
  const row = recordOf(node)
  const key = textOf(row["key"])
  if (key) add(key)
  for (const value of Object.values(row)) walkKeys(value, add)
}

/** Enemy ids the season can reach: named by the research tables, or referenced by a reached enemy's spawns and kit. */
export function collectEnemyIds(sources: EnemyIdSources): string[] {
  const enemies05 = recordOf(field(sources.enemies05, "enemies"))
  const known = (id: string): boolean => !!(enemies05[id] || recordOf(field(sources.assets07, "enemies"))[id])
  const set = new Set(Object.keys(recordOf(field(sources.assets07, "enemies"))))
  const add = (key: unknown): void => {
    if (typeof key === "string" && ENEMY_ID.test(key)) set.add(key)
  }
  for (const item of listOf(field(sources.ops03, "chess"))) {
    const row = recordOf(item)
    const kit = JSON.stringify([row["skill"] ?? null, row["talents"] ?? null, row["tokens"] ?? null])
    for (const match of kit.match(/enemy_\d+_[a-z0-9_]+/gi) ?? []) add(match)
  }
  for (const level of Object.values(recordOf(field(sources.maps05, "roundLevels")))) {
    const row = recordOf(level)
    const usedBy = listOf(row["usedBy"]).map((item) => String(item))
    if (usedBy.length && usedBy.every((item) => item.startsWith("mode_training"))) continue
    for (const ref of listOf(row["enemyDbRefs"])) add(Array.isArray(ref) ? ref[0] : ref)
    walkKeys(row["waves"], add)
    walkKeys(row["branches"], add)
  }
  for (const boss of Object.values(recordOf(field(sources.enemies05, "bosses")))) {
    const row = recordOf(boss)
    add(row["enemyId"])
    for (const spawn of listOf(row["spawns"])) add(spawn)
  }
  let changed = true
  while (changed) {
    changed = false
    for (const id of [...set]) {
      const enemy = recordOf(enemies05[id])
      if (!enemy || !Object.keys(enemy).length) continue
      const refs = new Set<string>(
        listOf(field(field(field(enemy, "ac"), "rand"), "spawns")).filter((item): item is string => typeof item === "string"),
      )
      const kit = JSON.stringify([enemy["skills"] ?? null, enemy["talent"] ?? null])
      for (const match of kit.match(/enemy_\d+_[a-z0-9_]+/gi) ?? []) refs.add(match)
      for (const ref of refs) {
        if (!set.has(ref) && known(ref)) {
          set.add(ref)
          changed = true
        }
      }
    }
  }
  return [...set].sort()
}

/** Boss enemy id to the handbook id that names its icon and sounds, when they differ. */
export function handbookIdsOf(enemies05: unknown): Map<string, string> {
  const out = new Map<string, string>()
  for (const boss of Object.values(recordOf(field(enemies05, "bosses")))) {
    const row: JsonRecord = recordOf(boss)
    const enemyId = textOf(row["enemyId"])
    const handbookId = textOf(row["handbookId"])
    if (enemyId && handbookId && handbookId !== enemyId) out.set(enemyId, handbookId)
  }
  return out
}
