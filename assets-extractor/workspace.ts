import { cacheLayout, type CacheLayout } from "#catalog/cache-layout.js"
import { extractorPackageRoot } from "#package-root.js"

/** Directories one extraction works in. */
export interface ExtractorWorkspace {
  /** Root of this package. */
  readonly root: string
  /** Layout of the cache directory given by the caller. */
  readonly cache: CacheLayout
}

export function extractorWorkspace(cacheDir: string): ExtractorWorkspace {
  return { root: extractorPackageRoot(), cache: cacheLayout(cacheDir) }
}
