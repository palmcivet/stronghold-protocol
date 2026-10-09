import { isAssetKey, type AssetKey, type Need } from "arknights-assets-catalog"

/** Keys no upstream source publishes, with the reason, as `compiler/input/base/absent.json` lists them. */
export type AbsentTable = ReadonlyMap<AssetKey, string>

/** Reads the absent table. Throws on a key that is not a valid asset key or on an empty reason. */
export function parseAbsentTable(value: unknown, label: string): AbsentTable {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}: expected an object of key to reason`)
  const table = new Map<AssetKey, string>()
  for (const [key, reason] of Object.entries(value)) {
    if (!isAssetKey(key)) throw new Error(`${label}: ${key} is not a valid asset key`)
    if (typeof reason !== "string" || reason.length === 0) throw new Error(`${label}: ${key} needs a reason`)
    table.set(key, reason)
  }
  return table
}

/** Marks the needs the table lists as optional and gives them their reason. Other needs are returned as they are. */
export function markAbsent(needs: readonly Need[], table: AbsentTable): Need[] {
  return needs.map((need) => {
    const reason = table.get(need.key)
    return reason === undefined ? need : { key: need.key, required: false, absent: reason }
  })
}
