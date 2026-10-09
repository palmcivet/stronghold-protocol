import { needsListIssues, type AssetKey, type Need, type NeedsList } from "arknights-assets-catalog"
import { BuildReadError } from "#port/build-error.js"
import type { BuildFiles } from "#port/build-files.js"

/**
 * Merges needs lists: a key listed more than once is required when any list requires it, and keeps the first
 * `absent` reason while it stays optional. Sorted by key.
 */
export function mergeNeeds(lists: readonly NeedsList[]): Need[] {
  const merged = new Map<AssetKey, Need>()
  for (const list of lists) {
    for (const need of list.needs) {
      const previous = merged.get(need.key)
      const required = (previous?.required ?? false) || need.required
      const absent = required ? undefined : (previous?.absent ?? need.absent)
      merged.set(need.key, absent === undefined ? { key: need.key, required } : { key: need.key, required, absent })
    }
  }
  return [...merged.keys()].sort().map((key) => merged.get(key) as Need)
}

export async function readNeedsList(files: BuildFiles, path: string): Promise<NeedsList> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await files.readText(path))
  } catch (cause) {
    throw new BuildReadError(path, `cannot read needs list: ${cause instanceof Error ? cause.message : String(cause)}`)
  }
  const issues = needsListIssues(parsed)
  if (issues.length > 0) throw new BuildReadError(path, `invalid needs list: ${issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`)
  return parsed as NeedsList
}

export async function readNeeds(files: BuildFiles, paths: readonly string[]): Promise<Need[]> {
  const lists: NeedsList[] = []
  for (const path of paths) lists.push(await readNeedsList(files, path))
  return mergeNeeds(lists)
}
