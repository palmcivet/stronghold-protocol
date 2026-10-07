export { catalogPackageRoot } from "./compiler/repo-root.js"
export {
  catalogWorkspace,
  type CatalogWorkspace,
  type CatalogWorkspaceOptions,
} from "./compiler/workspace.js"

export {
  Downloader,
  type AssetLedger,
  type DownloadJob,
  type DownloadTotals,
  type DownloaderOptions,
  type JobResult,
  type JobStatus,
  type LedgerFile,
} from "./compiler/download/downloader.js"
export { kindOf, type AssetKind } from "./compiler/download/format.js"
export {
  assetUrl,
  joinUrl,
  mirrorUrl,
  RAW_BASES,
  safeName,
  urlBase,
  urlDir,
  type RawBases,
} from "./compiler/download/source.js"
export {
  cachedJson,
  loadIndexes,
  type CachedJsonRequest,
  type IndexLoadOptions,
  type LoadedIndexes,
} from "./compiler/download/cache.js"

export { buildFonts, fontJobs, type FontBuild, type FontFaceFile, type FontSource } from "./compiler/font/build.js"

export { skelParserAvailable } from "./compiler/spine/skel.js"
export {
  processModels,
  type PlannedSpineModel,
  type ProcessModelsOptions,
  type ProcessModelsResult,
  type SpineEntry,
} from "./compiler/spine/model.js"
export { resolveRoles, roleAnimationNames, type AnimClip, type AnimRoles, type ResolveRolesOptions, type SkillClip } from "./compiler/spine/anim-role.js"
export {
  buildCatalogRelease,
  type CatalogRelease,
  type CatalogReleaseOptions,
} from "./compiler/release-index.js"
