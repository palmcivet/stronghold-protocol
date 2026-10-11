import type { AssetKind } from "#key/asset-key.js"

/** How the colour channels of an image or texture are encoded. */
export const ASSET_COLOR_SPACES = ["srgb", "linear"] as const

export type AssetColorSpace = (typeof ASSET_COLOR_SPACES)[number]

/** Kinds that can carry a `colorSpace`. */
export const COLOR_SPACE_KINDS: readonly AssetKind[] = ["image", "texture"]

/**
 * The colour space of an entry: its own `colorSpace`, else `srgb` for images and textures. Null for kinds without
 * colour data.
 */
export function assetColorSpace(entry: { readonly kind: AssetKind; readonly colorSpace?: AssetColorSpace }): AssetColorSpace | null {
  if (!COLOR_SPACE_KINDS.includes(entry.kind)) return null
  return entry.colorSpace ?? "srgb"
}
