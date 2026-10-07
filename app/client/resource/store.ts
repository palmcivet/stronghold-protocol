import {
  createResourceResolver,
  type AssetRef,
  type AssetRelease,
  type ResourceResolver,
} from "arknights-assets-catalog"

export interface ResourceStoreOptions {
  readonly baseManifest: string
  readonly seasonManifest: string
  readonly assetOrigin?: string
  readonly fetch?: typeof globalThis.fetch
  readonly retryDelays?: readonly number[]
}

export interface ResourceStore {
  readonly base: Record<string, unknown>
  readonly season: Record<string, unknown>
  readonly resources: Record<string, unknown>
  readonly resolver: ResourceResolver
  readonly assetOrigin: string
  ref(address: string): AssetRef | null
  resource(group: string, key: string): AssetRef | null
  url(ref: AssetRef): string
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

async function readJson(
  fetcher: typeof globalThis.fetch,
  address: string,
  retryDelays: readonly number[],
): Promise<Record<string, unknown>> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetcher(address, { cache: "no-cache" })
      if (!response.ok) {
        const error = Object.assign(new Error(`resource manifest failed: ${response.status} ${address}`), { status: response.status })
        if (response.status < 500 || attempt >= retryDelays.length) throw error
        throw error
      }
      return record(await response.json())
    } catch (error) {
      if (error && typeof error === "object" && "status" in error && Number(error.status) < 500) throw error
      if (attempt >= retryDelays.length) throw error
      await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt] ?? 0))
    }
  }
}

export async function loadResourceStore(options: ResourceStoreOptions): Promise<ResourceStore> {
  const fetcher = options.fetch ?? globalThis.fetch
  const retryDelays = options.retryDelays ?? [250, 1000]
  const base = await readJson(fetcher, options.baseManifest, retryDelays)
  const season = await readJson(fetcher, options.seasonManifest, retryDelays)
  const resourcePath = typeof season["resourceManifest"] === "string" ? season["resourceManifest"] : null
  if (!resourcePath) throw new Error("season manifest has no resource manifest")
  const resources = await readJson(fetcher, new URL(resourcePath, options.seasonManifest).toString(), retryDelays)
  const catalogPath = typeof base["catalog"] === "string" ? base["catalog"] : null
  if (!catalogPath) throw new Error("base manifest has no catalog")
  const catalog = await readJson(fetcher, new URL(catalogPath, options.baseManifest).toString(), retryDelays) as unknown as AssetRelease
  const resolver = createResourceResolver(catalog)
  const assetOrigin = options.assetOrigin ?? new URL(options.baseManifest).origin
  return {
    base,
    season,
    resources,
    resolver,
    assetOrigin,
    ref: (address) => resolver.ref(address),
    resource: (group, key) => {
      const value = resources[group]
      const item = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>)[key] : null
      return item && typeof item === "object" && !Array.isArray(item) && typeof (item as { id?: unknown }).id === "string"
        ? item as AssetRef
        : null
    },
    url: (ref) => resolver.url(ref, assetOrigin),
  }
}
