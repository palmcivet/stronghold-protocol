export {
  type CacheLayout,
  cacheLayout,
  DEFAULT_CACHE_DIR,
} from '#catalog/cache-layout.js';
export {
  type ExtractOptions,
  type ExtractResult,
  extractAssets,
  SPINE_META_SOURCE_ID,
  TABLE_SOURCE_ID,
} from '#catalog/extract.js';
export { mergeNeeds, readNeeds, readNeedsList } from '#catalog/needs.js';
export {
  buildRawCatalog,
  canonicalEntry,
  serializeRawCatalog,
} from '#catalog/raw-catalog.js';
export {
  type ExtractReport,
  type SourceAttempt,
  serializeReport,
} from '#catalog/report.js';

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
  type PngSize,
  pngSize,
  validate,
} from '#download/format.js';
export {
  AssetLedger,
  type LedgerFile,
  type LedgerRecord,
} from '#download/ledger.js';
export {
  assertGitVersion,
  GitRepoCache,
  type GitRepoCacheOptions,
  MIN_GIT_VERSION,
  parseGitVersion,
  proxyEnvironment,
  type RepoCache,
  type RepoRef,
  type RepoStats,
  type RepoWorkspace,
  repoLabel,
} from '#download/repo-cache.js';
export { RepoIndex } from '#download/repo-index.js';
export {
  mergeSparse,
  sparseCovers,
  sparseDirectories,
} from '#download/sparse.js';

export { decodeWoff2Tables, encodeWoff2, readSfnt } from '#font/woff2.js';

export { BuildReadError } from '#port/build-error.js';
export type { BuildFiles } from '#port/build-files.js';
export {
  GitError,
  type GitProcess,
  type GitRunOptions,
} from '#port/git-process.js';
export { nodeBuildFiles } from '#port/node-files.js';
export { nodeGitProcess } from '#port/node-git.js';
export {
  EXTRACT_HELP,
  type ExtractCommandDeps,
  type ExtractFlags,
  extractCommand,
  parseExtractArgs,
  UsageError,
} from '#script/extract.js';
export {
  type AssetSource,
  coversKey,
  type SourceContext,
  type SourceCover,
  type SourceFile,
  type SourceHit,
  underNamespace,
} from '#source/asset-source.js';
export { FONTS } from '#source/fonts/adapter.js';
export { baseNameOf, safeName, stemOf } from '#source/name.js';
export {
  loadPathTable,
  type PathTable,
  parsePathTable,
  pathTableFile,
} from '#source/path-table.js';
export {
  createSources,
  routeOf,
  SOURCE_TABLE,
  type SourceRoute,
  SPINE_META_NAMESPACE,
  sourcesFor,
} from '#source/table.js';
export { atlasInfo, normalizeAtlas, parseAtlas } from '#spine/atlas.js';
export {
  assembleSpine,
  SpineAssemblyError,
  type SpineInput,
  type SpineModel,
  type SpineOutputFile,
  spineMetaText,
} from '#spine/model.js';
export {
  parseSkel,
  type SkelAnimation,
  type SkelFacts,
  skelParserAvailable,
} from '#spine/skel.js';
