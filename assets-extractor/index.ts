export { extractorPackageRoot } from "./package-root.js"
export {
  extractorWorkspace,
  type ExtractorWorkspace,
  type ExtractorWorkspaceOptions,
} from "./workspace.js"

export {
  Downloader,
  type AssetLedger,
  type DownloadJob,
  type DownloadTotals,
  type DownloaderOptions,
  type JobResult,
  type JobStatus,
  type LedgerFile,
} from "./download/downloader.js"
export { kindOf, type AssetKind } from "./download/format.js"
export {
  assetUrl,
  joinUrl,
  mirrorUrl,
  RAW_BASES,
  safeName,
  urlBase,
  urlDir,
  type RawBases,
} from "./download/source.js"
export {
  cachedJson,
  loadIndexes,
  type CachedJsonRequest,
  type IndexLoadOptions,
  type LoadedIndexes,
} from "./download/cache.js"

export { BuildReadError } from "./port/build-error.js"
export type { BuildFiles } from "./port/build-files.js"
export type { BuildHttp } from "./port/build-http.js"
export { fetchBuildHttp } from "./port/fetch-http.js"
export { nodeBuildFiles } from "./port/node-files.js"

export { buildFonts, fontJobs, type FontBuild, type FontFaceFile, type FontSource } from "./font/build.js"

export { skelParserAvailable } from "./spine/skel.js"
export {
  processModels,
  type PlannedSpineModel,
  type ProcessModelsOptions,
  type ProcessModelsResult,
  type SpineEntry,
} from "./spine/model.js"

export {
  buildCatalogRelease,
  type CatalogRelease,
  type CatalogReleaseOptions,
} from "./catalog/release-index.js"
