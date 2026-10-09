// 路径表：上游路径不能由键推出的键，登记在适配器目录内的 paths.json，内容为键到仓库内相对路径的映射。

import { join } from "node:path"
import { assetKeyIssue, type AssetKey } from "arknights-assets-catalog"
import { extractorPackageRoot } from "#package-root.js"
import type { BuildFiles } from "#port/build-files.js"

export type PathTable = ReadonlyMap<AssetKey, string>

/** Checks a parsed `paths.json` and returns it as a map. Throws on an invalid key or path. */
export function parsePathTable(value: unknown, label: string): PathTable {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}: expected an object of key to path`)
  const table = new Map<AssetKey, string>()
  for (const [key, path] of Object.entries(value)) {
    const issue = assetKeyIssue(key)
    if (issue !== null) throw new Error(`${label}: invalid key ${JSON.stringify(key)}: ${issue}`)
    if (typeof path !== "string" || path.length === 0 || path.startsWith("/") || path.split("/").includes("..")) {
      throw new Error(`${label}: ${key} needs a relative repository path`)
    }
    table.set(key as AssetKey, path)
  }
  return table
}

/** `paths.json` of an adapter directory under `source/`. */
export function pathTableFile(sourceId: string): string {
  return join(extractorPackageRoot(), "source", sourceId, "paths.json")
}

export async function loadPathTable(files: BuildFiles, sourceId: string): Promise<PathTable> {
  const file = pathTableFile(sourceId)
  return parsePathTable(JSON.parse(await files.readText(file)), file)
}
