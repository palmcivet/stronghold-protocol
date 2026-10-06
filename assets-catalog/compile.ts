export { catalogPackageRoot } from "./compiler/repo-root.js"

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
  rawBases,
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
  findLocalEnemyModels,
  loadLocalEnemySpines,
  localEnemySpineMeta,
  localEnemySpinesFile,
  processModels,
  type LocalSpineMeta,
  type PlannedSpineModel,
  type ProcessModelsOptions,
  type ProcessModelsResult,
  type SpineEntry,
} from "./compiler/spine/model.js"
