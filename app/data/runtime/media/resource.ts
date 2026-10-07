import type { AssetRef, CatalogKind } from "arknights-assets-catalog"
import { asText, own, type JsonMap } from "./json-map.js"

function kindOf(address: string): CatalogKind {
  const extension = address.toLowerCase().split("?")[0]?.split(".").pop() ?? ""
  if (extension === "mp3" || extension === "m4a" || extension === "ogg" || extension === "wav") return "audio"
  if (extension === "otf" || extension === "ttf" || extension === "woff" || extension === "woff2") return "font"
  if (extension === "skel" || extension === "atlas") return "spine"
  if (extension === "obj" || extension === "json") return "model"
  return "image"
}

/** Convert a legacy manifest URL into a resource handle during migration. */
export function assetRefFromAddress(address: string, kind = kindOf(address), fallbackId: string | null = null): AssetRef {
  return { id: address, kind, address, fallbackId }
}

export function assetRefAt(manifest: unknown, group: string, key: string, kind?: CatalogKind): AssetRef | null {
  const root = manifest && typeof manifest === "object" && !Array.isArray(manifest) ? manifest as JsonMap : null
  const values = root ? own(root, group) : null
  const value = values && typeof values === "object" && !Array.isArray(values) ? asText(own(values as JsonMap, key)) : null
  return value ? assetRefFromAddress(value, kind) : null
}
