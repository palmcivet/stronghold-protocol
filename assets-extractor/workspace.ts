import { join, resolve } from "node:path"
import { extractorPackageRoot } from "./package-root.js"

export interface ExtractorWorkspace {
  readonly workspaceRoot: string
  readonly root: string
  readonly mediaDir: string
  readonly fontDir: string
  readonly cacheDir: string
}

export interface ExtractorWorkspaceOptions {
  readonly root?: string
  readonly mediaDir?: string
  readonly fontDir?: string
  readonly cacheDir?: string
}

/**
 * Resolve the extractor workspace. Media and font output default to the
 * `assets-catalog/product` directory next to this package; the cache defaults
 * to `.cache` inside this package.
 */
export function extractorWorkspace(options: ExtractorWorkspaceOptions = {}): ExtractorWorkspace {
  const root = resolve(options.root ?? extractorPackageRoot())
  const workspaceRoot = join(root, "..")
  const productDir = join(workspaceRoot, "assets-catalog", "product")
  return {
    workspaceRoot,
    root,
    mediaDir: resolve(options.mediaDir ?? join(productDir, "media")),
    fontDir: resolve(options.fontDir ?? join(productDir, "font")),
    cacheDir: resolve(options.cacheDir ?? join(root, ".cache")),
  }
}
