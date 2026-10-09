import {
  createAssetResolver,
  emptyLocalManifest,
  isPackManifest,
  type AssetKey,
  assetKindOf,
  type AssetLayer,
  type AssetResolver,
  type PackType,
  type ResolvedAsset,
} from "arknights-assets-catalog"
import { buildUpstreamManifest, type UpstreamIssue } from "arknights-compat-upstream"
import { isResourceRefs, resourceRefsIssues, type ResourceRefs } from "@alliance/data/refs"

/** Where a master backend keeps its data and its art. Its `data/assets.json` is read; its art is served from `/assets/`. */
export interface CompatSourceOptions {
  /** Root URL of the master backend, absolute or relative to the page. */
  readonly backend: string
  /** Next base pack. It sits under the upstream layer, so keys the backend lacks fall back to it. */
  readonly nextBase?: string
  /** Season that owns the trap item images. */
  readonly seasonId?: string
}

interface ResourceStoreCommonOptions {
  /** Local overlay manifest. A missing one is an empty overlay. */
  readonly local?: string
  readonly fetch?: typeof globalThis.fetch
  readonly retryDelays?: readonly number[]
  readonly loadImage?: (url: string) => Promise<unknown>
}

export interface PackResourceStoreOptions extends ResourceStoreCommonOptions {
  readonly base: string
  readonly season: string
  readonly mods?: readonly string[]
  readonly compat?: undefined
}

/** Reads a master backend. The base and season packs are not loaded in this mode. */
export interface CompatResourceStoreOptions extends ResourceStoreCommonOptions {
  readonly compat: CompatSourceOptions
  readonly base?: undefined
  readonly season?: undefined
  readonly mods?: undefined
}

export type ResourceStoreOptions = PackResourceStoreOptions | CompatResourceStoreOptions

export interface ResourceStore {
  readonly resolver: AssetResolver
  /** Problems found while mapping the master backend. Empty outside the compat mode. */
  readonly compatIssues: readonly UpstreamIssue[]
  /** `refs` of every layer, merged by JSON path, with the base and season shapes. */
  readonly refs: ResourceRefs
  ref(path: string | readonly string[]): AssetKey | null
  /** Takes one reference to the image of the key and resolves it, or null when the whole fallback chain failed. */
  image(key: AssetKey): Promise<unknown>
  /** Loads every key of the group. Resolves the key where its image loaded, null where it did not. Never rejects. */
  preload(group: string, onProgress?: (done: number, total: number) => void): Promise<readonly (AssetKey | null)[]>
  /** Drops one reference taken by `image` or `preload`. The cached image is removed with the last reference. */
  release(key: AssetKey): void
}

const DEFAULT_LOCAL_MANIFEST = "/res/local/manifest.json"
const DEFAULT_RETRY_DELAYS: readonly number[] = [250, 1000]
const MASTER_ASSETS_PATH = "data/assets.json"
const MASTER_LOCAL_ASSETS_PATH = "data/local-assets.json"

class HttpRequestError extends Error {
  readonly status: number

  constructor(url: string, status: number) {
    super(`request failed with ${status}: ${url}`)
    this.name = "HttpRequestError"
    this.status = status
  }
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

/** Runs `attempt` again after each delay while `isRetryable` accepts the error. The last error is thrown. */
async function withRetry<T>(
  retryDelays: readonly number[],
  attempt: () => Promise<T>,
  isRetryable: (error: unknown) => boolean,
): Promise<T> {
  for (let index = 0; ; index += 1) {
    try {
      return await attempt()
    } catch (error) {
      const delay = retryDelays[index]
      if (delay === undefined || !isRetryable(error)) throw error
      await wait(delay)
    }
  }
}

function isTransientRequestFailure(error: unknown): boolean {
  return !(error instanceof HttpRequestError) || error.status >= 500
}

/** Reads a JSON file. A server error is retried; a missing or refused file is not. */
async function readJson(fetcher: typeof globalThis.fetch, url: string, retryDelays: readonly number[]): Promise<unknown> {
  const response = await withRetry(
    retryDelays,
    async () => {
      const result = await fetcher(url, { cache: "no-cache" })
      if (!result.ok) throw new HttpRequestError(url, result.status)
      return result
    },
    isTransientRequestFailure,
  )
  return response.json()
}

async function readOptionalJson(fetcher: typeof globalThis.fetch, url: string, retryDelays: readonly number[]): Promise<unknown> {
  try {
    return await readJson(fetcher, url, retryDelays)
  } catch (error) {
    if (error instanceof HttpRequestError && error.status === 404) return undefined
    throw error
  }
}

async function loadManifest(
  fetcher: typeof globalThis.fetch,
  url: string,
  type: PackType,
  retryDelays: readonly number[],
): Promise<AssetLayer> {
  const value = await readJson(fetcher, url, retryDelays)
  if (!isPackManifest(value)) throw new Error(`not a pack manifest: ${url}`)
  if (value.pack.type !== type) throw new Error(`expected a ${type} pack at ${url}, got ${value.pack.type}`)
  return { manifest: value, url }
}

async function loadLocalManifest(
  fetcher: typeof globalThis.fetch,
  url: string,
  retryDelays: readonly number[],
): Promise<AssetLayer> {
  try {
    return await loadManifest(fetcher, url, "local", retryDelays)
  } catch (error) {
    if (error instanceof HttpRequestError && error.status === 404) return { manifest: emptyLocalManifest(), url }
    throw error
  }
}

function resolveAddress(path: string): string {
  return new URL(path, globalThis.location?.href).toString()
}

/** Root of a backend as an absolute URL that ends with `/`, so relative paths resolve under it. */
function backendRoot(backend: string): string {
  return resolveAddress(backend.endsWith("/") ? backend : `${backend}/`)
}

/** Kinds the image cache loads: `image` and `texture` keys, both loaded as images. */
function isImageKey(key: AssetKey): boolean {
  const kind = assetKindOf(key)
  return kind === "image" || kind === "texture"
}

/** Merged `refs` of the layers. Throws when a layer gives a name another shape than the base and season packs do. */
function resourceRefs(resolver: AssetResolver): ResourceRefs {
  const refs = resolver.refs
  if (isResourceRefs(refs)) return refs
  const issues = resourceRefsIssues(refs).map((issue) => `${issue.path}: ${issue.message}`)
  throw new Error(`pack refs do not match the base and season shapes: ${issues.join("; ")}`)
}

function warnFailure(key: AssetKey, error: unknown): void {
  console.warn(`resource ${key} failed to load`, error)
}

interface LayerSet {
  readonly layers: readonly AssetLayer[]
  readonly compatIssues: readonly UpstreamIssue[]
}

async function loadPackLayers(fetcher: typeof globalThis.fetch, options: PackResourceStoreOptions, retryDelays: readonly number[]): Promise<LayerSet> {
  const layers = await Promise.all([
    loadManifest(fetcher, resolveAddress(options.base), "base", retryDelays),
    loadManifest(fetcher, resolveAddress(options.season), "season", retryDelays),
    ...(options.mods ?? []).map((mod) => loadManifest(fetcher, resolveAddress(mod), "mod", retryDelays)),
  ])
  return { layers, compatIssues: [] }
}

/** The master backend as an upstream layer, under the next base pack when one is configured. */
async function loadCompatLayers(fetcher: typeof globalThis.fetch, compat: CompatSourceOptions, retryDelays: readonly number[]): Promise<LayerSet> {
  const backend = backendRoot(compat.backend)
  const assetsUrl = new URL(MASTER_ASSETS_PATH, backend).toString()
  const localAssetsUrl = new URL(MASTER_LOCAL_ASSETS_PATH, backend).toString()
  const [assets, localAssets] = await Promise.all([
    readJson(fetcher, assetsUrl, retryDelays),
    readOptionalJson(fetcher, localAssetsUrl, retryDelays),
  ])
  const upstream = await buildUpstreamManifest({ backend, assets, localAssets, seasonId: compat.seasonId })
  const nextBase = compat.nextBase === undefined ? [] : [await loadManifest(fetcher, resolveAddress(compat.nextBase), "base", retryDelays)]
  return {
    layers: [...nextBase, { manifest: upstream.manifest, url: assetsUrl }],
    compatIssues: upstream.issues,
  }
}

export async function loadResourceStore(options: ResourceStoreOptions): Promise<ResourceStore> {
  const fetcher: typeof globalThis.fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init))
  const retryDelays = options.retryDelays ?? DEFAULT_RETRY_DELAYS
  const loadImage = options.loadImage ?? loadBrowserImage

  if (!options.compat && (options.base === undefined || options.season === undefined)) {
    throw new Error("the resource store needs either compat, or both base and season")
  }

  // MARK: layers

  const [{ layers, compatIssues }, local] = await Promise.all([
    options.compat
      ? loadCompatLayers(fetcher, options.compat, retryDelays)
      : loadPackLayers(fetcher, options, retryDelays),
    loadLocalManifest(fetcher, resolveAddress(options.local ?? DEFAULT_LOCAL_MANIFEST), retryDelays),
  ])
  const resolver = createAssetResolver([...layers, local])
  const refs = resourceRefs(resolver)

  // MARK: image cache

  interface CacheEntry {
    references: number
    readonly loaded: Promise<unknown>
  }
  const cache = new Map<AssetKey, CacheEntry>()

  async function loadAssetFile(asset: ResolvedAsset): Promise<unknown> {
    const main = asset.files.find((file) => file.role === "main")
    if (!main) throw new Error(`${asset.key} has no main file`)
    return withRetry(retryDelays, () => loadImage(main.url), () => true)
  }

  async function loadChain(key: AssetKey): Promise<unknown> {
    const failed = new Set<AssetKey>()
    try {
      for (;;) {
        const asset = resolver.resolve(key, { failed })
        if (!asset) return null
        try {
          return await loadAssetFile(asset)
        } catch (error) {
          warnFailure(asset.key, error)
          failed.add(asset.key)
        }
      }
    } catch (error) {
      warnFailure(key, error)
      return null
    }
  }

  function acquire(key: AssetKey): Promise<unknown> {
    if (!isImageKey(key)) return Promise.reject(new Error(`${key} is not an image or texture key`))
    let entry = cache.get(key)
    if (!entry) {
      entry = { references: 0, loaded: loadChain(key) }
      cache.set(key, entry)
    }
    entry.references += 1
    return entry.loaded
  }

  function release(key: AssetKey): void {
    const entry = cache.get(key)
    if (!entry) return
    entry.references -= 1
    if (entry.references <= 0) cache.delete(key)
  }

  async function preload(group: string, onProgress?: (done: number, total: number) => void): Promise<readonly (AssetKey | null)[]> {
    const keys = resolver.keys().filter((key) => isImageKey(key) && resolver.entry(key)?.asset.preloadGroup === group)
    let done = 0
    return Promise.all(keys.map(async (key) => {
      const image = await acquire(key)
      done += 1
      onProgress?.(done, keys.length)
      if (image !== null) return key
      release(key)
      return null
    }))
  }

  return {
    resolver,
    compatIssues,
    refs,
    ref: (path) => resolver.ref(path),
    image: acquire,
    preload,
    release,
  }
}

function loadBrowserImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`image request failed: ${url}`))
    image.src = url
  })
}
