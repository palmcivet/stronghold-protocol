import { basename, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

export interface AssetsCatalogPaths {
  readonly root: string
  readonly productDir: string
  readonly mediaDir: string
  readonly fontDir: string
  readonly releasePath: string
  readonly cacheDir: string
}

export interface DataWorkspace {
  readonly workspaceRoot: string
  readonly root: string
  readonly compilerDir: string
  readonly inputDir: string
  readonly researchDir: string
  readonly productDir: string
  readonly cacheDir: string
  readonly gamedataCacheDir: string
  readonly reportPath: string
  readonly catalog: AssetsCatalogPaths
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
  const gamedataCacheDir = join(cacheDir, "gamedata")
  const catalogRoot = join(workspaceRoot, "assets-catalog")
  const catalogProductDir = join(catalogRoot, "product")
  return {
    root,
    workspaceRoot,
    compilerDir,
    inputDir,
    researchDir: join(inputDir, "research"),
    productDir,
    cacheDir,
    gamedataCacheDir,
    reportPath: join(cacheDir, "build-data-report.json"),
    catalog: {
      root: catalogRoot,
      productDir: catalogProductDir,
      mediaDir: join(catalogProductDir, "media"),
      fontDir: join(catalogProductDir, "font"),
      releasePath: join(catalogProductDir, "catalog.json"),
      cacheDir: join(workspaceRoot, "assets-extractor", ".cache"),
    },
    seasonDir: (seasonId) => join(productDir, "season", seasonId),
    seasonInputDir: (seasonId) => join(inputDir, "season", seasonId),
  }
}
