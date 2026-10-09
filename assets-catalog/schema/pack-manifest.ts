import { packFileRoot, type PublishedPack } from "#address/pack.js"
import type { AssetKey, AssetKind } from "#key/asset-key.js"
import type { AssetFile } from "#schema/asset-file.js"
import { fieldPath, indexPath, isRecord, SchemaCheck, SHA256_HEX, type SchemaIssue } from "#schema/issue.js"
import { checkEntryHead } from "#schema/raw-catalog.js"

export const PACK_TYPES = ["base", "season", "mod", "local", "upstream"] as const

export type PackType = (typeof PACK_TYPES)[number]

export const REQUIRED_PACK_TYPES = ["base", "season"] as const

export type RequiredPackType = (typeof REQUIRED_PACK_TYPES)[number]

/** One layer of the asset overlay. Base, season, mod, local and upstream packs share this format. */
export interface PackManifest {
  readonly schemaVersion: 1
  readonly pack: PackInfo
  readonly requires: readonly PackRequirement[]
  /** Root of the files, relative to the manifest URL or absolute. Ends with `/`. */
  readonly fileRoot: string
  readonly assets: Readonly<Record<AssetKey, PackAsset>>
  /** Domain ids to keys. The shape belongs to the pack author; every leaf is a key. */
  readonly refs?: PackRefs
}

export interface PackInfo {
  readonly type: PackType
  readonly id: string
  readonly version: string
  /** SHA-256 of this manifest after normalization, excluding this field. */
  readonly contentHash: string
}

export interface PackRequirement {
  readonly type: RequiredPackType
  readonly id: string
  readonly version: string
}

export interface PackAsset {
  readonly kind: AssetKind
  readonly files: readonly PackFile[]
  readonly dependsOn: readonly AssetKey[]
  readonly fallbackId: AssetKey | null
  readonly preloadGroup: string | null
}

export interface PackFile extends AssetFile {
  /** Only for a file outside the address layout: an absolute URL or a path relative to `fileRoot`. An empty `hash` skips verification. */
  readonly href?: string
}

export interface PackRefs {
  readonly [name: string]: PackRefNode
}

export type PackRefNode = AssetKey | PackRefs | readonly PackRefNode[]

function checkRefNode(check: SchemaCheck, value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => checkRefNode(check, item, indexPath(path, index)))
    return
  }
  if (isRecord(value)) {
    for (const [name, item] of Object.entries(value)) checkRefNode(check, item, fieldPath(path, name))
    return
  }
  check.key(value, path)
}

/** Checks that `refs` is an object whose leaves are all valid keys. */
export function packRefsIssues(value: unknown, path = "refs"): readonly SchemaIssue[] {
  const check = new SchemaCheck()
  if (check.record(value, path)) checkRefNode(check, value, path)
  return check.issues
}

export function packManifestIssues(value: unknown): readonly SchemaIssue[] {
  const check = new SchemaCheck()
  const root = check.record(value, "")
  if (!root) return check.issues
  check.oneOf(root["schemaVersion"], "schemaVersion", [1])
  const pack = check.record(root["pack"], "pack")
  if (pack) {
    check.oneOf(pack["type"], "pack.type", PACK_TYPES)
    check.text(pack["id"], "pack.id")
    check.text(pack["version"], "pack.version")
    const hash = pack["contentHash"]
    if (typeof hash !== "string" || !SHA256_HEX.test(hash)) check.fail("pack.contentHash", "expected a lowercase hex SHA-256")
  }
  const requires = check.list(root["requires"], "requires")
  requires?.forEach((item, index) => {
    const path = indexPath("requires", index)
    const requirement = check.record(item, path)
    if (!requirement) return
    check.oneOf(requirement["type"], fieldPath(path, "type"), REQUIRED_PACK_TYPES)
    check.text(requirement["id"], fieldPath(path, "id"))
    check.text(requirement["version"], fieldPath(path, "version"))
  })
  const fileRoot = check.text(root["fileRoot"], "fileRoot")
  if (fileRoot !== null && !fileRoot.endsWith("/")) check.fail("fileRoot", "expected a trailing '/'")
  const assets = check.record(root["assets"], "assets")
  for (const [recordKey, item] of Object.entries(assets ?? {})) {
    const path = fieldPath("assets", recordKey)
    const asset = check.record(item, path)
    if (!asset) continue
    const key = checkEntryHead(check, recordKey, asset, path, true)
    const fallback = asset["fallbackId"]
    if (fallback !== null && check.key(fallback, fieldPath(path, "fallbackId")) && fallback === key) {
      check.fail(fieldPath(path, "fallbackId"), "an asset cannot fall back to itself")
    }
    if (asset["preloadGroup"] !== null) check.text(asset["preloadGroup"], fieldPath(path, "preloadGroup"))
  }
  if (root["refs"] !== undefined) check.issues.push(...packRefsIssues(root["refs"]))
  return check.issues
}

export function isPackManifest(value: unknown): value is PackManifest {
  return packManifestIssues(value).length === 0
}

/** `contentHash` of `emptyLocalManifest()`: SHA-256 of its canonical JSON without `pack.contentHash` and `fileRoot`. */
const EMPTY_LOCAL_CONTENT_HASH = "83ff2ec26e3d2df78a7096c0333053daa90d7292633c1bb6dab6e89eba11fa98"

/** The local overlay with no entries. Served when the local manifest is missing, so the layer is always present. */
export function emptyLocalManifest(): PackManifest {
  const pack: PublishedPack = { type: "local", id: "local", version: "0", contentHash: EMPTY_LOCAL_CONTENT_HASH }
  return {
    schemaVersion: 1,
    pack,
    requires: [],
    fileRoot: packFileRoot(pack),
    assets: {},
  }
}
