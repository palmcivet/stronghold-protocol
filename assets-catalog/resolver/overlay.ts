import { fileUrl } from "#address/file.js"
import type { AssetKey, AssetKind } from "#key/asset-key.js"
import type { SchemaIssue } from "#schema/issue.js"
import { packManifestIssues, type PackAsset, type PackFile, type PackInfo, type PackManifest, type PackRefs } from "#schema/pack-manifest.js"
import { mergeRefs, refKeyAt } from "#resolver/refs.js"

/** One manifest of the overlay and the absolute URL it was loaded from. */
export interface AssetLayer {
  readonly manifest: PackManifest
  readonly url: string | URL
}

export interface ResolvedFile extends PackFile {
  /** Absolute URL, with `?v=` when the file has a hash. */
  readonly url: string
}

/** The entry that answers a key, taken from the highest layer that has it. */
export interface ResolvedAsset {
  readonly key: AssetKey
  readonly kind: AssetKind
  readonly asset: PackAsset
  /** The layer that provided the entry. */
  readonly pack: PackInfo
  readonly files: readonly ResolvedFile[]
}

export interface ResolveOptions {
  /** Keys whose files failed to load; resolution moves on along `fallbackId`. */
  readonly failed?: ReadonlySet<AssetKey>
}

export interface AssetResolver {
  readonly layers: readonly AssetLayer[]
  /** `refs` of every layer, merged by JSON path. */
  readonly refs: PackRefs
  has(key: AssetKey): boolean
  keys(): readonly AssetKey[]
  /** The entry of exactly this key, without fallback. */
  entry(key: AssetKey): ResolvedAsset | null
  /** The entry of this key followed by its `fallbackId` chain. Throws on a cycle or a kind change. */
  chain(key: AssetKey): readonly ResolvedAsset[]
  /** The first entry of the chain that is not marked failed. */
  resolve(key: AssetKey, options?: ResolveOptions): ResolvedAsset | null
  /** Entries reached through `dependsOn`, transitively, each resolved with its own fallback chain. */
  dependencies(key: AssetKey): readonly ResolvedAsset[]
  /** The key at a `refs` path such as `chars.char_002_amiya.avatar`. */
  ref(path: string | readonly string[]): AssetKey | null
}

export type AssetResolveErrorCode = "invalid-manifest" | "invalid-url" | "fallback-cycle" | "fallback-kind"

export class AssetResolveError extends Error {
  readonly code: AssetResolveErrorCode
  readonly issues: readonly SchemaIssue[]

  constructor(code: AssetResolveErrorCode, message: string, issues: readonly SchemaIssue[] = []) {
    super(message)
    this.name = "AssetResolveError"
    this.code = code
    this.issues = issues
  }
}

interface Slot {
  readonly layer: AssetLayer
  readonly asset: PackAsset
}

function checkLayer(layer: AssetLayer, index: number): void {
  const issues = packManifestIssues(layer.manifest)
  if (issues.length > 0) {
    const first = issues[0] as SchemaIssue
    throw new AssetResolveError("invalid-manifest", `layer ${index} is not a valid pack manifest: ${first.path}: ${first.message}`, issues)
  }
  try {
    new URL(layer.url)
  } catch {
    throw new AssetResolveError("invalid-url", `layer ${index} (${layer.manifest.pack.type}:${layer.manifest.pack.id}) needs an absolute manifest URL, got ${String(layer.url)}`)
  }
}

/**
 * Stacks manifests into one virtual file system, lowest layer first.
 * A key in a higher layer replaces the whole entry below it. Every manifest is checked with the pack manifest guard.
 */
export function createAssetResolver(layers: readonly AssetLayer[]): AssetResolver {
  layers.forEach(checkLayer)
  const slots = new Map<AssetKey, Slot>()
  for (const layer of layers) {
    for (const [key, asset] of Object.entries(layer.manifest.assets) as [AssetKey, PackAsset][]) slots.set(key, { layer, asset })
  }
  const refs = mergeRefs(layers.flatMap((layer) => (layer.manifest.refs ? [layer.manifest.refs] : [])))
  const entries = new Map<AssetKey, ResolvedAsset>()
  const chains = new Map<AssetKey, readonly ResolvedAsset[]>()

  const entry = (key: AssetKey): ResolvedAsset | null => {
    const cached = entries.get(key)
    if (cached) return cached
    const slot = slots.get(key)
    if (!slot) return null
    const { manifest, url } = slot.layer
    const resolved: ResolvedAsset = {
      key,
      kind: slot.asset.kind,
      asset: slot.asset,
      pack: manifest.pack,
      files: slot.asset.files.map((file) => ({ ...file, url: fileUrl({ manifestUrl: url, fileRoot: manifest.fileRoot, key, file }) })),
    }
    entries.set(key, resolved)
    return resolved
  }

  const chain = (key: AssetKey): readonly ResolvedAsset[] => {
    const cached = chains.get(key)
    if (cached) return cached
    const list: ResolvedAsset[] = []
    const seen: AssetKey[] = []
    let next: AssetKey | null = key
    while (next !== null) {
      if (seen.includes(next)) {
        throw new AssetResolveError("fallback-cycle", `fallback cycle: ${[...seen, next].join(" -> ")}`)
      }
      seen.push(next)
      const found = entry(next)
      if (!found) break
      const head = list[0]
      if (head && found.kind !== head.kind) {
        throw new AssetResolveError("fallback-kind", `${found.key} is a ${found.kind}, but ${head.key} falls back to it as a ${head.kind}`)
      }
      list.push(found)
      next = found.asset.fallbackId
    }
    chains.set(key, list)
    return list
  }

  const resolve = (key: AssetKey, options?: ResolveOptions): ResolvedAsset | null => {
    const failed = options?.failed
    return chain(key).find((candidate) => !failed?.has(candidate.key)) ?? null
  }

  return {
    layers,
    refs,
    has: (key) => slots.has(key),
    keys: () => [...slots.keys()],
    entry,
    chain,
    resolve,
    dependencies: (key) => {
      const out: ResolvedAsset[] = []
      const root = resolve(key)
      if (!root) return out
      const seen = new Set<AssetKey>([root.key])
      const visit = (from: ResolvedAsset): void => {
        for (const dependency of from.asset.dependsOn) {
          const resolved = resolve(dependency)
          if (!resolved || seen.has(resolved.key)) continue
          seen.add(resolved.key)
          out.push(resolved)
          visit(resolved)
        }
      }
      visit(root)
      return out
    },
    ref: (path) => refKeyAt(refs, path),
  }
}
