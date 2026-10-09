import { assetKeyIssue, assetKindOf, packManifestIssues, type AssetKey, type PackAsset, type PackManifest } from "arknights-assets-catalog"
import { ANY, ASSET_RULES, IGNORED_PATHS, matchLocation, type AssetRule, type JsonRecord, type MappedRule, type RuleContext } from "#data/asset/rules.js"
import { isJsonRecord, masterLeaves, type MasterLeaf } from "#data/asset/leaves.js"
import { fileFormatOf, packFileOf, spineFiles, type UpstreamFile } from "#data/asset/files.js"
import { RefTable } from "#data/asset/refs.js"

export const UPSTREAM_PACK_ID = "master"
/** Season whose trap item images the master `items` section names. */
export const DEFAULT_ITEM_SEASON_ID = "act2autochess"

const ZERO_HASH = "0".repeat(64)

export type UpstreamSource = "assets" | "local-assets"

/** One address the mapping did not turn into a key, or a value it could not place. */
export interface UpstreamIssue {
  readonly source: UpstreamSource
  /** Dotted path of the value in the master file, e.g. `chars.char_003_kalts.avatar`. */
  readonly path: string
  /** The address, or null when the value is not an address. */
  readonly address: string | null
  readonly reason: string
}

export interface UpstreamInput {
  /** Absolute URL of the master backend root. Every file href resolves against it. */
  readonly backend: string
  /** Parsed `data/assets.json` of the backend. */
  readonly assets: unknown
  /** Parsed `data/local-assets.json` of the backend, when the backend has one. */
  readonly localAssets?: unknown
  readonly seasonId?: string | undefined
}

export interface UpstreamBuild {
  readonly manifest: PackManifest
  readonly issues: readonly UpstreamIssue[]
}

interface AssetCandidate {
  readonly source: UpstreamSource
  readonly path: string
  readonly address: string | null
  readonly key: string
  readonly files: readonly UpstreamFile[]
}

interface RefCandidate {
  readonly source: UpstreamSource
  readonly path: string
  readonly refPath: readonly string[]
  /** One key, or the keys of a list in master order. */
  readonly value: string | readonly string[]
}

interface AliasCandidate {
  readonly source: UpstreamSource
  readonly path: string
  readonly refPath: readonly string[]
  readonly targetPath: readonly string[]
}

interface Collected {
  readonly issues: UpstreamIssue[]
  readonly assets: AssetCandidate[]
  readonly refs: RefCandidate[]
  readonly aliases: AliasCandidate[]
}

interface Matched {
  readonly rule: AssetRule
  readonly params: readonly string[]
}

function isIgnored(path: readonly string[]): boolean {
  return IGNORED_PATHS.some((prefix) => path.length >= prefix.length && prefix.every((name, index) => name === ANY || name === path[index]))
}

function matchLeaf(leaf: MasterLeaf): Matched | null {
  for (const rule of ASSET_RULES) {
    if (rule.value !== leaf.type) continue
    const params = matchLocation(rule.location, leaf.path)
    if (params === null) continue
    if (rule.when !== undefined && !rule.when(leaf.parent)) continue
    return { rule, params }
  }
  return null
}

function contextOf(leaf: MasterLeaf, params: readonly string[], seasonId: string, captures: readonly string[], text: string): RuleContext {
  return { params, captures, text, parent: leaf.parent, seasonId }
}

function captureGroups(pattern: RegExp, text: string): readonly string[] | null {
  const match = pattern.exec(text)
  return match === null ? null : match.slice(1).map((group) => group ?? "")
}

/** Maps one address with a `text` rule. Records the candidate, or the reason it cannot be mapped. */
function mapAddress(
  source: UpstreamSource,
  path: string,
  address: string,
  rule: MappedRule,
  context: RuleContext,
  out: Collected,
): { readonly key: string; readonly captures: readonly string[] } | null {
  const pattern = rule.pattern
  if (pattern === undefined) throw new Error(`rule ${rule.name} maps addresses but has no address pattern`)
  const captures = captureGroups(pattern, address)
  if (captures === null) {
    out.issues.push({ source, path, address, reason: `does not match the address pattern of ${rule.name}` })
    return null
  }
  const format = fileFormatOf(address)
  if (format === null) {
    out.issues.push({ source, path, address, reason: "the address has no known file extension" })
    return null
  }
  const key = rule.key({ ...context, captures, text: address })
  out.assets.push({ source, path, address, key, files: [{ role: "main", name: null, format, address }] })
  return { key, captures }
}

/** Collects every leaf of one master section into candidates. The catalog is not consulted here. */
function collect(source: UpstreamSource, root: JsonRecord, seasonId: string, out: Collected): void {
  for (const leaf of masterLeaves(root)) {
    if (isIgnored(leaf.path)) continue
    const path = leaf.path.join(".")
    const matched = matchLeaf(leaf)
    if (matched === null) {
      out.issues.push({ source, path, address: leaf.type === "text" ? String(leaf.value) : null, reason: leaf.type === "other" ? "not an address" : "no rule maps this path" })
      continue
    }
    const { rule, params } = matched
    if (rule.action === "refuse") {
      out.issues.push({ source, path, address: leaf.type === "text" ? String(leaf.value) : null, reason: rule.reason })
      continue
    }
    if (rule.action === "alias") {
      const context = contextOf(leaf, params, seasonId, [], String(leaf.value))
      out.aliases.push({ source, path, refPath: rule.ref(context), targetPath: rule.target(context) })
      continue
    }
    if (leaf.type === "spine") {
      const result = spineFiles(leaf.value as JsonRecord)
      if ("reason" in result) {
        out.issues.push({ source, path, address: null, reason: result.reason })
        continue
      }
      const context = contextOf(leaf, params, seasonId, [], "")
      const key = rule.key(context)
      out.assets.push({ source, path, address: null, key, files: result.files })
      if (rule.ref) out.refs.push({ source, path, refPath: rule.ref(context), value: key })
      continue
    }
    if (leaf.type === "texts") {
      const keys: string[] = []
      const addresses = leaf.value as readonly string[]
      addresses.forEach((address, index) => {
        const mapped = mapAddress(source, `${path}.${index}`, address, rule, contextOf(leaf, params, seasonId, [], address), out)
        if (mapped !== null) keys.push(mapped.key)
      })
      if (rule.ref) out.refs.push({ source, path, refPath: rule.ref(contextOf(leaf, params, seasonId, [], "")), value: keys })
      continue
    }
    const address = String(leaf.value)
    const mapped = mapAddress(source, path, address, rule, contextOf(leaf, params, seasonId, [], address), out)
    if (mapped !== null && rule.ref) {
      out.refs.push({ source, path, refPath: rule.ref(contextOf(leaf, params, seasonId, mapped.captures, address)), value: mapped.key })
    }
  }
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (isJsonRecord(value)) return Object.fromEntries(Object.keys(value).sort().map((name) => [name, sortKeys(value[name])]))
  return value
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

function backendRoot(backend: string): string {
  let url: URL
  try {
    url = new URL(backend)
  } catch {
    throw new TypeError(`the backend needs an absolute URL, got ${backend}`)
  }
  url.search = ""
  url.hash = ""
  if (!url.pathname.endsWith("/")) url.pathname = `${url.pathname}/`
  return url.toString()
}

function recordOf(value: unknown, name: string): JsonRecord {
  if (!isJsonRecord(value)) throw new TypeError(`${name} must be a parsed JSON object`)
  return value
}

function singleAssetManifest(root: string, key: AssetKey, asset: PackAsset): PackManifest {
  return {
    schemaVersion: 1,
    pack: { type: "upstream", id: UPSTREAM_PACK_ID, version: "0", contentHash: ZERO_HASH },
    requires: [],
    fileRoot: root,
    assets: { [key]: asset },
  }
}

/**
 * Turns the master `assets.json`, and the optional `local-assets.json`, into one `upstream` pack manifest.
 * Addresses the rules do not map, and entries the catalog rejects, are returned as issues; they are never guessed.
 */
export async function buildUpstreamManifest(input: UpstreamInput): Promise<UpstreamBuild> {
  const root = backendRoot(input.backend)
  const assets = recordOf(input.assets, "assets.json")
  const version = assets["version"]
  const hash = assets["hash"]
  if ((typeof version !== "number" && typeof version !== "string") || typeof hash !== "string" || hash.length === 0) {
    throw new TypeError("assets.json needs a version and a hash")
  }
  const seasonId = input.seasonId ?? DEFAULT_ITEM_SEASON_ID
  const collected: Collected = { issues: [], assets: [], refs: [], aliases: [] }
  collect("assets", assets, seasonId, collected)
  if (input.localAssets !== undefined) collect("local-assets", recordOf(input.localAssets, "local-assets.json"), seasonId, collected)

  const accepted = new Map<AssetKey, PackAsset>()
  for (const candidate of collected.assets) {
    const invalid = assetKeyIssue(candidate.key)
    if (invalid !== null) {
      collected.issues.push({ source: candidate.source, path: candidate.path, address: candidate.address, reason: `invalid key ${JSON.stringify(candidate.key)}: ${invalid}` })
      continue
    }
    const key = candidate.key as AssetKey
    const asset: PackAsset = {
      kind: assetKindOf(key),
      files: candidate.files.map((file) => packFileOf(root, file)),
      dependsOn: [],
      fallbackId: null,
      preloadGroup: null,
    }
    const problem = packManifestIssues(singleAssetManifest(root, key, asset))[0]
    if (problem !== undefined) {
      collected.issues.push({ source: candidate.source, path: candidate.path, address: candidate.address, reason: `${problem.path}: ${problem.message}` })
      continue
    }
    const first = accepted.get(key)
    if (first === undefined) accepted.set(key, asset)
    else if (canonicalJson(first) !== canonicalJson(asset)) {
      collected.issues.push({ source: candidate.source, path: candidate.path, address: candidate.address, reason: `${key} is already mapped from another address; the first one is kept` })
    }
  }

  const refs = new RefTable()
  const isAccepted = (key: string): key is AssetKey => accepted.has(key as AssetKey)
  for (const candidate of collected.refs) {
    const value = typeof candidate.value === "string"
      ? (isAccepted(candidate.value) ? candidate.value : null)
      : candidate.value.filter(isAccepted)
    if (value === null || (typeof value !== "string" && value.length === 0)) continue
    const conflict = refs.set(candidate.refPath, value)
    if (conflict !== null) collected.issues.push({ source: candidate.source, path: candidate.path, address: null, reason: conflict })
  }
  for (const alias of collected.aliases) {
    const target = refs.get(alias.targetPath)
    if (target === null) {
      collected.issues.push({ source: alias.source, path: alias.path, address: null, reason: `names ${alias.targetPath.join(".")}, which has no key` })
      continue
    }
    const conflict = refs.set(alias.refPath, target)
    if (conflict !== null) collected.issues.push({ source: alias.source, path: alias.path, address: null, reason: conflict })
  }

  const sortedAssets = Object.fromEntries([...accepted].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)))
  const pack = { type: "upstream" as const, id: UPSTREAM_PACK_ID, version: `${String(version)}+${hash}` }
  const body = { schemaVersion: 1 as const, pack, requires: [], assets: sortedAssets, refs: refs.toRefs() }
  const contentHash = await sha256Hex(canonicalJson(body))
  const manifest: PackManifest = { ...body, pack: { ...pack, contentHash }, fileRoot: root }
  const problems = packManifestIssues(manifest)
  if (problems.length > 0) {
    const first = problems[0]
    throw new Error(`upstream manifest is invalid at ${first?.path}: ${first?.message}`)
  }
  return { manifest, issues: collected.issues }
}
