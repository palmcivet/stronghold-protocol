// 原始目录：条目按键排序，文件按固定顺序，不写时间戳；相同输入两次提取的 catalog.json 字节相同。

import { rawCatalogIssues, type AssetFile, type AssetKey, type MissingNeed, type RawCatalog, type RawEntry } from "arknights-assets-catalog"

const ROLE_ORDER = ["main", "fallback", "skel", "atlas", "page", "meta"] as const

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function fileOrder(a: AssetFile, b: AssetFile): number {
  return ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || compare(a.name ?? "", b.name ?? "") || compare(a.format, b.format)
}

/** Copies an entry with its fields, files and dependencies in canonical order. */
export function canonicalEntry(entry: RawEntry): RawEntry {
  return {
    key: entry.key,
    kind: entry.kind,
    files: [...entry.files].sort(fileOrder).map((file) => ({ role: file.role, name: file.name, format: file.format, bytes: file.bytes, hash: file.hash })),
    dependsOn: [...new Set(entry.dependsOn)].sort(),
    source: { id: entry.source.id, path: entry.source.path, revision: entry.source.revision },
  }
}

/** Builds the raw catalog and checks it with the catalog guard. */
export function buildRawCatalog(entries: Iterable<RawEntry>, missing: Iterable<MissingNeed>): RawCatalog {
  const byKey = new Map<AssetKey, RawEntry>()
  for (const entry of entries) byKey.set(entry.key, canonicalEntry(entry))
  const sortedEntries: Record<AssetKey, RawEntry> = {}
  for (const key of [...byKey.keys()].sort()) sortedEntries[key] = byKey.get(key) as RawEntry
  const catalog: RawCatalog = {
    schemaVersion: 1,
    entries: sortedEntries,
    missing: [...missing]
      .sort((a, b) => compare(a.key, b.key))
      .map((need) => ({ key: need.key, required: need.required, tried: need.tried.map((attempt) => ({ source: attempt.source, reason: attempt.reason })) })),
  }
  const issues = rawCatalogIssues(catalog)
  if (issues.length > 0) throw new Error(`raw catalog fails its guard: ${issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`)
  return catalog
}

export function serializeRawCatalog(catalog: RawCatalog): string {
  return `${JSON.stringify(catalog, null, 2)}\n`
}
