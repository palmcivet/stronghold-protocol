import type { AssetKey, AssetKind, FileRole } from "arknights-assets-catalog"
import type { RepoCache, RepoWorkspace } from "#download/repo-cache.js"
import type { BuildFiles } from "#port/build-files.js"

/** A kind and a key path prefix of whole segments; an empty prefix covers the whole kind. */
export interface SourceCover {
  readonly kind: AssetKind
  readonly namespace: string
}

export interface SourceFile {
  readonly role: FileRole
  /** File name for multi-file kinds, null for single-file kinds. */
  readonly name: string | null
  /** Absolute path: inside the clone workspace for git sources. */
  readonly location: string
  readonly convert?: "atlas" | "woff2"
}

export interface SourceHit {
  /** Upstream path of the entry, before renaming. */
  readonly path: string
  readonly revision: string | null
  readonly files: readonly SourceFile[]
  readonly dependsOn: readonly AssetKey[]
  /** The workspace holding `files`, so their directories can be checked out; null for a source outside git. */
  readonly repo: RepoWorkspace | null
  /** Whether Spine atlas pages carry premultiplied alpha. */
  readonly premultipliedAlpha?: boolean
}

export interface SourceContext {
  readonly cacheDir: string
  readonly files: BuildFiles
  /** Shallow clones by repository and branch; offline it only returns existing clones. */
  readonly repos: RepoCache
  readonly offline: boolean
  readonly refreshIndex: boolean
  /** Records a key whose lookup by name found several upstream files. The lookup then returns null. */
  ambiguous(key: AssetKey, candidates: readonly string[]): void
}

/** Maps keys to upstream files. Cloning, checkout, validation, conversion and the catalog are shared code. */
export interface AssetSource {
  readonly id: string
  readonly covers: readonly SourceCover[]
  /** Opens the clone and loads indexes. Throws when the source cannot be used in this run. */
  prepare(context: SourceContext): Promise<void>
  /** The upstream files of a key, or null when this source does not have it. Never throws for a miss. */
  locate(key: AssetKey, context: SourceContext): Promise<SourceHit | null>
}

/** Whether a key path lies under a namespace prefix of whole segments. */
export function underNamespace(path: string, namespace: string): boolean {
  return namespace === "" || path === namespace || path.startsWith(`${namespace}/`)
}

export function coversKey(source: Pick<AssetSource, "covers">, kind: AssetKind, path: string): boolean {
  return source.covers.some((cover) => cover.kind === kind && underNamespace(path, cover.namespace))
}
