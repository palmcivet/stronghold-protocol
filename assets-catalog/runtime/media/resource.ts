import { assetRef, type AssetRef, type AssetRelease } from "#schema/asset-ref.js"
import type { CatalogEntry } from "#schema/catalog-entry.js"

export interface ResourceResolver {
  ref(address: string): AssetRef | null
  resolve(ref: AssetRef): CatalogEntry | null
  dependencies(ref: AssetRef): readonly CatalogEntry[]
  url(ref: AssetRef, origin?: string): string
}

function entriesOf(release: AssetRelease): readonly CatalogEntry[] {
  return Object.values(release.entries ?? {})
}

function findById(release: AssetRelease, id: string): CatalogEntry | null {
  return entriesOf(release).find((entry) => entry.id === id) ?? null
}

export function createResourceResolver(release: AssetRelease): ResourceResolver {
  const resolveEntry = (ref: AssetRef): CatalogEntry | null => {
    const visited = new Set<string>()
    let id: string | null = ref.id
    while (id && !visited.has(id)) {
      visited.add(id)
      const entry = findById(release, id)
      if (entry) return entry
      id = id === ref.id ? ref.fallbackId : null
    }
    return null
  }
  return {
    ref(address) {
      const entry = entriesOf(release).find((item) => item.address === address)
      return entry ? assetRef(entry) : null
    },
    resolve(ref) {
      return resolveEntry(ref)
    },
    dependencies(ref) {
      const entry = resolveEntry(ref)
      if (!entry) return []
      return [entry, ...entry.dependsOn.map((id) => findById(release, id)).filter((item): item is CatalogEntry => item !== null)]
    },
    url(ref, origin = "") {
      const entry = resolveEntry(ref)
      const address = entry?.address ?? ref.address
      return origin ? new URL(address, origin).toString() : address
    },
  }
}
