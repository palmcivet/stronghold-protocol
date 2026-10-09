/** Every asset kind. Each kind has one file rule in the address module. */
export const ASSET_KINDS = ["image", "texture", "spine", "audio", "font", "model", "json"] as const

export type AssetKind = (typeof ASSET_KINDS)[number]

/** `<kind>:<path>`, without a file extension. Use `parseAssetKey` or `isAssetKey` to check a string. */
export type AssetKey = `${AssetKind}:${string}`

/** Most path segments in a key, the namespace included. */
export const ASSET_PATH_MAX_SEGMENTS = 8
/** Longest key in characters, `<kind>:` included. */
export const ASSET_KEY_MAX_LENGTH = 200

const SEGMENT = /^[A-Za-z0-9_-]+$/
const KIND_SET: ReadonlySet<string> = new Set(ASSET_KINDS)

export interface ParsedAssetKey {
  readonly key: AssetKey
  readonly kind: AssetKind
  readonly path: string
  readonly segments: readonly string[]
  /** The first path segment. */
  readonly namespace: string
}

export class AssetKeyError extends Error {
  readonly value: unknown

  constructor(value: unknown, reason: string) {
    super(`invalid asset key ${JSON.stringify(value)}: ${reason}`)
    this.name = "AssetKeyError"
    this.value = value
  }
}

export function isAssetKind(value: unknown): value is AssetKind {
  return typeof value === "string" && KIND_SET.has(value)
}

/** Why a value is not a valid asset key, or null when it is one. */
export function assetKeyIssue(value: unknown): string | null {
  if (typeof value !== "string") return "not a string"
  if (value.length > ASSET_KEY_MAX_LENGTH) return `longer than ${ASSET_KEY_MAX_LENGTH} characters`
  const colon = value.indexOf(":")
  if (colon < 0) return "missing ':' between kind and path"
  const kind = value.slice(0, colon)
  if (!isAssetKind(kind)) return `unknown kind "${kind}"`
  const path = value.slice(colon + 1)
  if (path.length === 0) return "empty path"
  const segments = path.split("/")
  if (segments.length > ASSET_PATH_MAX_SEGMENTS) return `more than ${ASSET_PATH_MAX_SEGMENTS} path segments`
  const bad = segments.find((segment) => !SEGMENT.test(segment))
  if (bad !== undefined) return bad.length === 0 ? "empty path segment" : `segment "${bad}" may only use letters, digits, '_' and '-'`
  return null
}

export function isAssetKey(value: unknown): value is AssetKey {
  return assetKeyIssue(value) === null
}

/** Splits a key into kind, path and segments. Throws `AssetKeyError` for an invalid key. */
export function parseAssetKey(value: string): ParsedAssetKey {
  const issue = assetKeyIssue(value)
  if (issue !== null) throw new AssetKeyError(value, issue)
  const colon = value.indexOf(":")
  const path = value.slice(colon + 1)
  const segments = path.split("/")
  return {
    key: value as AssetKey,
    kind: value.slice(0, colon) as AssetKind,
    path,
    segments,
    namespace: segments[0] as string,
  }
}

/** Builds a key from a kind and a path. Throws `AssetKeyError` when the result is invalid. */
export function formatAssetKey(kind: AssetKind, path: string): AssetKey {
  return parseAssetKey(`${kind}:${path}`).key
}

/** The kind of a valid key. */
export function assetKindOf(key: AssetKey): AssetKind {
  return parseAssetKey(key).kind
}

/** The path of a valid key, without the kind. */
export function assetPathOf(key: AssetKey): string {
  return parseAssetKey(key).path
}
