import { basename, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { catalogWorkspace, type CatalogWorkspace, type CatalogWorkspaceOptions } from "arknights-assets-catalog/compile"

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
  readonly catalog: CatalogWorkspace
  seasonDir(seasonId: string): string
  seasonInputDir(seasonId: string): string
}

export interface DataWorkspaceOptions extends CatalogWorkspaceOptions {
  readonly productDir?: string
  readonly dataCacheDir?: string
}

/**
 * Resolve compiler inputs and outputs. Explicit paths are used by deployment and
 * CI; the package-root fallback remains only for local migration.
 */
export function dataWorkspace(options: DataWorkspaceOptions = {}): DataWorkspace {
  const catalog = catalogWorkspace(options)
  const moduleRoot = fileURLToPath(new URL("../", import.meta.url))
  const defaultRoot = basename(moduleRoot) === "dist" ? resolve(moduleRoot, "..") : moduleRoot
  const root = resolve(options.root ?? defaultRoot)
  const compilerDir = join(root, "compiler")
  const inputDir = join(compilerDir, "input")
  const productDir = resolve(options.productDir ?? join(root, "product"))
  const cacheDir = resolve(options.dataCacheDir ?? join(root, ".cache"))
  const gamedataCacheDir = join(cacheDir, "gamedata")
  return {
    root,
    compilerDir,
    inputDir,
    researchDir: join(inputDir, "research"),
    productDir,
    cacheDir,
    gamedataCacheDir,
    reportPath: join(cacheDir, "build-data-report.json"),
    workspaceRoot: catalog.workspaceRoot,
    catalog,
    seasonDir: (seasonId) => join(productDir, "season", seasonId),
    seasonInputDir: (seasonId) => join(inputDir, "season", seasonId),
  }
}
