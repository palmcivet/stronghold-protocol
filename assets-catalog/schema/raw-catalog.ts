import type { AssetKey, AssetKind } from "#key/asset-key.js"
import { assetKindOf } from "#key/asset-key.js"
import { checkAssetFiles, type AssetFile } from "#schema/asset-file.js"
import { fieldPath, indexPath, SchemaCheck, type SchemaIssue } from "#schema/issue.js"

/** Every extracted asset by key, plus the needs no source could provide. */
export interface RawCatalog {
  readonly schemaVersion: 1
  readonly entries: Readonly<Record<AssetKey, RawEntry>>
  readonly missing: readonly MissingNeed[]
}

export interface RawEntry {
  readonly key: AssetKey
  readonly kind: AssetKind
  readonly files: readonly AssetFile[]
  /** Other keys this entry needs, e.g. the textures of a material. */
  readonly dependsOn: readonly AssetKey[]
  readonly source: RawSource
}

export interface RawSource {
  readonly id: string
  /** Original path or bundle name in the source, before renaming. */
  readonly path: string
  /** Source commit, official resource version or client version; null when unknown. */
  readonly revision: string | null
}

export interface MissingNeed {
  readonly key: AssetKey
  readonly required: boolean
  readonly tried: readonly { readonly source: string; readonly reason: string }[]
}

/** Checks `key`, `kind`, `files` and `dependsOn` shared by raw entries and pack assets. Returns the checked key. */
export function checkEntryHead(check: SchemaCheck, recordKey: string, entry: Readonly<Record<string, unknown>>, path: string, href: boolean): AssetKey | null {
  const key = check.key(recordKey, path)
  if (!key) return null
  const kind = assetKindOf(key)
  if (entry["kind"] !== kind) check.fail(fieldPath(path, "kind"), `expected "${kind}" to match the key`)
  checkAssetFiles(check, kind, entry["files"], fieldPath(path, "files"), { href })
  check.keys(entry["dependsOn"], fieldPath(path, "dependsOn"))
  return key
}

export function rawCatalogIssues(value: unknown): readonly SchemaIssue[] {
  const check = new SchemaCheck()
  const root = check.record(value, "")
  if (!root) return check.issues
  check.oneOf(root["schemaVersion"], "schemaVersion", [1])
  const entries = check.record(root["entries"], "entries")
  for (const [recordKey, item] of Object.entries(entries ?? {})) {
    const path = fieldPath("entries", recordKey)
    const entry = check.record(item, path)
    if (!entry) continue
    const key = checkEntryHead(check, recordKey, entry, path, false)
    if (key && entry["key"] !== key) check.fail(fieldPath(path, "key"), "expected the record key")
    const sourcePath = fieldPath(path, "source")
    const source = check.record(entry["source"], sourcePath)
    if (source) {
      check.text(source["id"], fieldPath(sourcePath, "id"))
      check.string(source["path"], fieldPath(sourcePath, "path"))
      if (source["revision"] !== null) check.text(source["revision"], fieldPath(sourcePath, "revision"))
    }
  }
  const missing = check.list(root["missing"], "missing")
  missing?.forEach((item, index) => {
    const path = indexPath("missing", index)
    const need = check.record(item, path)
    if (!need) return
    check.key(need["key"], fieldPath(path, "key"))
    check.boolean(need["required"], fieldPath(path, "required"))
    const tried = check.list(need["tried"], fieldPath(path, "tried"))
    tried?.forEach((attempt, at) => {
      const attemptPath = indexPath(fieldPath(path, "tried"), at)
      const record = check.record(attempt, attemptPath)
      if (!record) return
      check.text(record["source"], fieldPath(attemptPath, "source"))
      check.string(record["reason"], fieldPath(attemptPath, "reason"))
    })
  })
  return check.issues
}

export function isRawCatalog(value: unknown): value is RawCatalog {
  return rawCatalogIssues(value).length === 0
}
