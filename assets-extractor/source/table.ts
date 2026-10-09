// 来源表：按种类与命名空间列出来源顺序，前者未命中再试后者。最长的命名空间前缀优先。

import { parseAssetKey, type AssetKey, type AssetKind } from "arknights-assets-catalog"
import type { BuildFiles } from "#port/build-files.js"
import { arkModelsSource } from "#source/ark-models/adapter.js"
import { arknightsAssetsSource } from "#source/arknights-assets/adapter.js"
import { coversKey, underNamespace, type AssetSource } from "#source/asset-source.js"
import { fexliSource } from "#source/fexli/adapter.js"
import { fontsSource } from "#source/fonts/adapter.js"
import { gamedataSource } from "#source/gamedata/adapter.js"
import { loadPathTable } from "#source/path-table.js"
import { voiceSource } from "#source/voice/adapter.js"
import { yuanyanSource } from "#source/yuanyan/adapter.js"

export interface SourceRoute {
  readonly kind: AssetKind
  /** Key path prefix of whole segments; empty for the whole kind. */
  readonly namespace: string
  /** Source ids, tried in order. An empty list means no adapter provides these keys. */
  readonly sources: readonly string[]
}

/** Generated from the `spine` entry of the same path, not located in any source. */
export const SPINE_META_NAMESPACE = "spine-meta"

export const SOURCE_TABLE: readonly SourceRoute[] = Object.freeze([
  { kind: "image", namespace: "char", sources: ["yuanyan"] },
  { kind: "image", namespace: "skin", sources: ["yuanyan"] },
  { kind: "image", namespace: "enemy", sources: ["yuanyan"] },
  { kind: "image", namespace: "token", sources: ["yuanyan"] },
  { kind: "image", namespace: "skill", sources: ["yuanyan"] },
  { kind: "image", namespace: "skill/empty", sources: ["arknights-assets"] },
  { kind: "image", namespace: "skill/empty_large", sources: ["arknights-assets"] },
  { kind: "image", namespace: "item", sources: ["yuanyan"] },
  { kind: "image", namespace: "prof", sources: ["arknights-assets"] },
  { kind: "image", namespace: "camp", sources: ["arknights-assets"] },
  { kind: "image", namespace: "battle", sources: ["arknights-assets"] },
  { kind: "image", namespace: "rank", sources: ["arknights-assets"] },
  { kind: "image", namespace: "module", sources: [] },
  { kind: "image", namespace: "fx", sources: [] },
  { kind: "image", namespace: "ui", sources: ["arknights-assets"] },
  { kind: "image", namespace: "band", sources: ["arknights-assets"] },
  { kind: "image", namespace: "bond", sources: ["arknights-assets"] },
  { kind: "image", namespace: "season", sources: ["arknights-assets"] },
  { kind: "texture", namespace: "map", sources: [] },
  { kind: "texture", namespace: "mesh", sources: [] },
  { kind: "spine", namespace: "char", sources: ["fexli"] },
  { kind: "spine", namespace: "skin", sources: ["fexli"] },
  { kind: "spine", namespace: "token", sources: ["fexli", "ark-models"] },
  { kind: "spine", namespace: "enemy", sources: ["ark-models"] },
  { kind: "audio", namespace: "voice", sources: ["voice"] },
  { kind: "audio", namespace: "sfx", sources: ["voice"] },
  { kind: "audio", namespace: "bgm", sources: ["voice"] },
  { kind: "font", namespace: "", sources: ["fonts"] },
  { kind: "model", namespace: "mesh", sources: [] },
  { kind: "json", namespace: "gamedata", sources: ["gamedata"] },
  { kind: "json", namespace: "material", sources: [] },
  { kind: "json", namespace: "prefab", sources: [] },
  { kind: "json", namespace: "anim-roles", sources: [] },
  { kind: "json", namespace: "board", sources: [] },
])

/** The route with the longest namespace that holds the key, or null for an unregistered namespace. */
export function routeOf(key: AssetKey, table: readonly SourceRoute[] = SOURCE_TABLE): SourceRoute | null {
  const { kind, path } = parseAssetKey(key)
  let best: SourceRoute | null = null
  for (const route of table) {
    if (route.kind !== kind || !underNamespace(path, route.namespace)) continue
    if (!best || route.namespace.length > best.namespace.length) best = route
  }
  return best
}

/** Sources to try for a key, in order, limited to sources whose `covers` include it. */
export function sourcesFor(key: AssetKey, sources: ReadonlyMap<string, AssetSource>, table: readonly SourceRoute[] = SOURCE_TABLE): AssetSource[] {
  const route = routeOf(key, table)
  if (!route) return []
  const { kind, path } = parseAssetKey(key)
  return route.sources.map((id) => sources.get(id)).filter((source): source is AssetSource => !!source && coversKey(source, kind, path))
}

/** The seven git sources, with their path tables loaded from the adapter directories. */
export async function createSources(files: BuildFiles): Promise<AssetSource[]> {
  return [
    yuanyanSource(),
    fexliSource(),
    arkModelsSource(),
    arknightsAssetsSource(await loadPathTable(files, "arknights-assets")),
    voiceSource(await loadPathTable(files, "voice")),
    fontsSource(),
    gamedataSource(),
  ]
}
