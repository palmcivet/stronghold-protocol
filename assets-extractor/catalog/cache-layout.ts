import { join, resolve } from "node:path"

/** Default cache directory, relative to the working directory of the command. */
export const DEFAULT_CACHE_DIR = ".cache/assets"

/** Paths inside one extractor cache directory. */
export interface CacheLayout {
  readonly root: string
  /** Shallow clones: `repos/<owner>/<repo>@<branch>/`. */
  readonly repos: string
  /** Indexes derived by sources: `sources/<sourceId>/`. */
  readonly sources: string
  /** Normalized files at their published address. */
  readonly files: string
  readonly catalog: string
  readonly ledger: string
  readonly report: string
}

export function cacheLayout(cacheDir: string): CacheLayout {
  const root = resolve(cacheDir)
  return {
    root,
    repos: join(root, "repos"),
    sources: join(root, "sources"),
    files: join(root, "files"),
    catalog: join(root, "catalog.json"),
    ledger: join(root, "ledger.json"),
    report: join(root, "report.json"),
  }
}
