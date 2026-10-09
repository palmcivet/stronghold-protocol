import { join } from "node:path"
import { BuildReadError, cacheLayout, type BuildFiles } from "arknights-assets-extractor"
import { fileAddress, formatAssetKey } from "arknights-assets-catalog"

/**
 * Absolute path of an official gamedata table in the extractor cache. `rel` is relative to
 * `zh_CN/gamedata/`, e.g. `excel/activity_table.json`, and maps to `json:gamedata/<rel without .json>`.
 */
export function gamedataPath(extractCacheDir: string, rel: string): string {
  if (!rel.endsWith(".json")) throw new BuildReadError(rel, "gamedata tables are JSON files")
  const key = formatAssetKey("json", `gamedata/${rel.slice(0, -".json".length)}`)
  return join(cacheLayout(extractCacheDir).files, fileAddress(key, { name: null, format: "json" }))
}

/** Reads a gamedata table from the extractor cache. Throws when the table has not been extracted. */
export async function readGamedata(files: BuildFiles, extractCacheDir: string, rel: string): Promise<string> {
  const path = gamedataPath(extractCacheDir, rel)
  if (!(await files.exists(path))) {
    throw new BuildReadError(path, `gamedata ${rel} is not in the extractor cache; run pnpm extract:media first`)
  }
  return files.readText(path)
}
