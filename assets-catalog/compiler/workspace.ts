import { join, resolve } from "node:path"
import { catalogPackageRoot } from "./repo-root.js"

export interface CatalogWorkspace {
  readonly workspaceRoot: string
  readonly root: string
  readonly productDir: string
  readonly mediaDir: string
  readonly fontDir: string
  readonly cacheDir: string
  readonly releasePath: string
}

export interface CatalogWorkspaceOptions {
  readonly root?: string
  readonly mediaDir?: string
  readonly fontDir?: string
  readonly cacheDir?: string
}

/**
 * Resolve the catalog workspace.
 *
 * `root` is the explicit workspace root used by deployment and CI. The package
 * root fallback is retained only for local migration and old commands.
 */
export function catalogWorkspace(options: CatalogWorkspaceOptions = {}): CatalogWorkspace {
  const root = resolve(options.root ?? catalogPackageRoot())
  const workspaceRoot = join(root, "..")
  const productDir = join(root, "product")
  const mediaDir = resolve(options.mediaDir ?? join(productDir, "media"))
  const fontDir = resolve(options.fontDir ?? join(productDir, "font"))
  return {
    workspaceRoot,
    root,
    productDir,
    mediaDir,
    fontDir,
    cacheDir: resolve(options.cacheDir ?? join(root, ".cache")),
    releasePath: join(productDir, "catalog.json"),
  }
}
