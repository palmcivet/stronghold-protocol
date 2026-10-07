import type { CatalogEntry, CatalogKind } from "./catalog-entry.js"

/** A stable reference passed between game data and a resource adapter. */
export interface AssetRef {
  readonly id: string
  readonly kind: CatalogKind
  readonly address: string
  readonly fallbackId: string | null
}

export interface AssetRelease {
  readonly schemaVersion: number
  readonly entries: Readonly<Record<string, CatalogEntry>>
}

export function assetRef(entry: CatalogEntry): AssetRef {
  return {
    id: entry.id,
    kind: entry.kind,
    address: entry.address,
    fallbackId: entry.fallbackId,
  }
}
