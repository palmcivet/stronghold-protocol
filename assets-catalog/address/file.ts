import { parseAssetKey, type AssetKey, type AssetKind } from "#key/asset-key.js"
import type { AssetFile } from "#schema/asset-file.js"
import type { PackFile } from "#schema/pack-manifest.js"

/** Kinds whose entry is a directory of named files. Every other kind is one file per format. */
export const MULTI_FILE_KINDS: ReadonlySet<AssetKind> = new Set<AssetKind>(["spine"])

/** Query parameter that pins a file URL to its content. */
export const VERSION_PARAM = "v"
/** How many leading hex digits of the hash go into the version parameter. */
export const VERSION_HASH_LENGTH = 12

export class AssetAddressError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AssetAddressError"
  }
}

export function isMultiFileKind(kind: AssetKind): boolean {
  return MULTI_FILE_KINDS.has(kind)
}

/**
 * Relative address of one file of an asset, the same for every pack and for the extractor cache.
 * Single-file kinds: `<kind>/<path>.<format>`. Multi-file kinds: `<kind>/<path>/<name>`.
 */
export function fileAddress(key: AssetKey, file: Pick<AssetFile, "name" | "format">): string {
  const { kind, path } = parseAssetKey(key)
  if (isMultiFileKind(kind)) {
    if (!file.name || file.name.includes("/") || file.name.startsWith(".")) {
      throw new AssetAddressError(`${key}: a ${kind} file needs a plain file name, got ${JSON.stringify(file.name)}`)
    }
    return `${kind}/${path}/${file.name}`
  }
  if (file.name !== null) throw new AssetAddressError(`${key}: a ${kind} file has no name, got ${JSON.stringify(file.name)}`)
  return `${kind}/${path}.${file.format}`
}

export interface FileUrlOptions {
  /** Absolute URL the manifest was loaded from. */
  readonly manifestUrl: string | URL
  /** `fileRoot` of that manifest. */
  readonly fileRoot: string
  readonly key: AssetKey
  readonly file: PackFile
}

/**
 * Absolute URL of a pack file. `href` wins over the address layout; both resolve against `fileRoot`,
 * which resolves against the manifest URL. A non-empty hash adds `?v=<first 12 hex digits>`.
 */
export function fileUrl(options: FileUrlOptions): string {
  const root = new URL(options.fileRoot, options.manifestUrl)
  const url = new URL(options.file.href ?? fileAddress(options.key, options.file), root)
  if (options.file.hash.length > 0) url.searchParams.set(VERSION_PARAM, options.file.hash.slice(0, VERSION_HASH_LENGTH))
  return url.toString()
}
