export { cacheLayout, DEFAULT_CACHE_DIR, type CacheLayout } from "#catalog/cache-layout.js"
export { extractAssets, SPINE_META_SOURCE_ID, TABLE_SOURCE_ID, type ExtractOptions, type ExtractResult } from "#catalog/extract.js"
export { mergeNeeds, readNeeds, readNeedsList } from "#catalog/needs.js"
export { buildRawCatalog, canonicalEntry, serializeRawCatalog } from "#catalog/raw-catalog.js"
export { serializeReport, type ExtractReport, type SourceAttempt } from "#catalog/report.js"

export {
  asBuffer,
  formatOfPath,
  isAtlasText,
  isCompletePng,
  isMp3,
  isSfnt,
  isSkelBinary,
  isWebp,
  isWoff2,
  pngSize,
  validate,
  type PngSize,
} from "#download/format.js"
export { AssetLedger, type LedgerFile, type LedgerRecord } from "#download/ledger.js"
export {
  assertGitVersion,
  GitRepoCache,
  MIN_GIT_VERSION,
  parseGitVersion,
  proxyEnvironment,
  repoLabel,
  type GitRepoCacheOptions,
  type RepoCache,
  type RepoRef,
  type RepoStats,
  type RepoWorkspace,
} from "#download/repo-cache.js"
export { RepoIndex } from "#download/repo-index.js"
export { mergeSparse, sparseCovers, sparseDirectories } from "#download/sparse.js"

export { decodeWoff2Tables, encodeWoff2, readSfnt } from "#font/woff2.js"

export { BuildReadError } from "#port/build-error.js"
export type { BuildFiles } from "#port/build-files.js"
export { GitError, type GitProcess, type GitRunOptions } from "#port/git-process.js"
export { nodeBuildFiles } from "#port/node-files.js"
export { nodeGitProcess } from "#port/node-git.js"

export { coversKey, underNamespace, type AssetSource, type SourceContext, type SourceCover, type SourceFile, type SourceHit } from "#source/asset-source.js"
export { baseNameOf, safeName, stemOf } from "#source/name.js"
export { loadPathTable, parsePathTable, pathTableFile, type PathTable } from "#source/path-table.js"
export { FONTS } from "#source/fonts/adapter.js"
export { createSources, routeOf, SOURCE_TABLE, sourcesFor, SPINE_META_NAMESPACE, type SourceRoute } from "#source/table.js"

export { normalizeAtlas, parseAtlas, atlasInfo } from "#spine/atlas.js"
export { parseSkel, skelParserAvailable, type SkelAnimation, type SkelFacts } from "#spine/skel.js"
export { assembleSpine, SpineAssemblyError, spineMetaText, type SpineInput, type SpineModel, type SpineOutputFile } from "#spine/model.js"

export { EXTRACT_HELP, extractCommand, parseExtractArgs, UsageError, type ExtractCommandDeps, type ExtractFlags } from "#script/extract.js"
