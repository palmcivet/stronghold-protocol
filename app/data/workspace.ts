import { basename, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

export interface DataWorkspace {
  readonly workspaceRoot: string
  readonly root: string
  readonly compilerDir: string
  readonly inputDir: string
  readonly researchDir: string
  /** Input of the base pack: `base/pack.json`. */
  readonly baseInputDir: string
  readonly productDir: string
  readonly cacheDir: string
  /** Cache of `assets-extractor`, which holds the gamedata tables this package compiles from. */
  readonly extractCacheDir: string
  /** Need lists the extractor reads: `base.json` and `season-<id>.json`. */
  readonly needsDir: string
  /** Files this package derives from extracted ones, laid out by address and listed by `catalog.json`. */
  readonly derivedDir: string
  readonly reportPath: string
  seasonDir(seasonId: string): string
  seasonInputDir(seasonId: string): string
}

export interface DataWorkspaceOptions {
  readonly root?: string
  readonly productDir?: string
  readonly dataCacheDir?: string
}

/**
 * Resolve the data package paths without loading the build-time extractor, so
 * the same module is safe to import from Vite configs. Explicit paths are used
 * by deployment and CI; the package-root fallback is used only for local runs.
 */
export function dataWorkspace(options: DataWorkspaceOptions = {}): DataWorkspace {
  const moduleRoot = fileURLToPath(new URL("./", import.meta.url))
  const defaultRoot = basename(moduleRoot) === "dist" ? resolve(moduleRoot, "..") : moduleRoot
  const root = resolve(options.root ?? defaultRoot)
  const workspaceRoot = resolve(root, "..", "..")
  const compilerDir = join(root, "compiler")
  const inputDir = join(root, "compiler", "input")
  const productDir = resolve(options.productDir ?? join(root, "product"))
  const cacheDir = resolve(options.dataCacheDir ?? join(root, ".cache"))
  const extractCacheDir = join(cacheDir, "assets")
  const needsDir = join(cacheDir, "needs")
  const derivedDir = join(cacheDir, "derived")
  return {
    root,
    workspaceRoot,
    compilerDir,
    inputDir,
    researchDir: join(inputDir, "research"),
    baseInputDir: join(inputDir, "base"),
    productDir,
    cacheDir,
    extractCacheDir,
    needsDir,
    derivedDir,
    reportPath: join(cacheDir, "build-data-report.json"),
    seasonDir: (seasonId) => join(productDir, "season", seasonId),
    seasonInputDir: (seasonId) => join(inputDir, "season", seasonId),
  }
}
