import type { AssetKey } from "#key/asset-key.js"
import { fieldPath, indexPath, SchemaCheck, type SchemaIssue } from "#schema/issue.js"

export const NEEDS_PACK_TYPES = ["base", "season"] as const

export type NeedsPackType = (typeof NEEDS_PACK_TYPES)[number]

/** The keys one pack asks the extractor for. */
export interface NeedsList {
  readonly schemaVersion: 1
  readonly pack: { readonly type: NeedsPackType; readonly id: string }
  readonly needs: readonly Need[]
}

export interface Need {
  readonly key: AssetKey
  /** A missing required key fails the extraction; a missing optional key is reported. */
  readonly required: boolean
  /** Why no upstream source publishes the key. Only on optional needs; the report lists such a missing key as expected. */
  readonly absent?: string
}

export function needsListIssues(value: unknown): readonly SchemaIssue[] {
  const check = new SchemaCheck()
  const root = check.record(value, "")
  if (!root) return check.issues
  check.oneOf(root["schemaVersion"], "schemaVersion", [1])
  const pack = check.record(root["pack"], "pack")
  if (pack) {
    check.oneOf(pack["type"], "pack.type", NEEDS_PACK_TYPES)
    check.text(pack["id"], "pack.id")
  }
  const needs = check.list(root["needs"], "needs")
  const seen = new Set<string>()
  needs?.forEach((item, index) => {
    const path = indexPath("needs", index)
    const need = check.record(item, path)
    if (!need) return
    const key = check.key(need["key"], fieldPath(path, "key"))
    const required = check.boolean(need["required"], fieldPath(path, "required"))
    if (need["absent"] !== undefined && check.text(need["absent"], fieldPath(path, "absent")) !== null && required === true) {
      check.fail(fieldPath(path, "absent"), "a required need cannot be absent upstream")
    }
    if (key && seen.has(key)) check.fail(fieldPath(path, "key"), `${key} is listed twice`)
    if (key) seen.add(key)
  })
  return check.issues
}

export function isNeedsList(value: unknown): value is NeedsList {
  return needsListIssues(value).length === 0
}
