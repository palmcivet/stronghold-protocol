export type Vec3 = readonly [number, number, number]

/** Height of a raised tile class, in tiles (master render/style.js TILE_H). */
export const TILE_HEIGHT = Object.freeze({
  wall: 0.42,
  forbid: 0.3,
  sep: 0.55,
  bench: 0.16,
  platform: 0.26,
})

export type TileHeightClass = keyof typeof TILE_HEIGHT

/** Raised glyphs and the height class each stands at (master render/style.js GLYPH). */
export const RAISED_GLYPH_HEIGHT: Readonly<Record<string, TileHeightClass>> = Object.freeze({
  "#": "forbid",
  X: "sep",
  h: "wall",
  a: "bench",
  A: "bench",
})

/** Top bevel inset and drop of low tiles and of raised blocks (tiles). */
export const BEVEL = Object.freeze({
  low: Object.freeze([0.035, 0.018] as const),
  block: Object.freeze([0.04, 0.035] as const),
})

/** Deep-sea basins: floor depth below the ground (tiles). */
export const BASIN = 0.14

/** How far the island's cliff faces go down (tiles). */
export const CLIFF = 0.75

/** Final Assault bench plate: rim, seam and lift of the 2×2 light panels. */
export const PANEL = Object.freeze({ rim: 0.085, seam: 0.05, lift: 0.004 })

/** Height of a platform device standing on its tile. */
export const PLATFORM_DEVICE_HEIGHT = TILE_HEIGHT.platform

/** 活性源石 colours in linear space (master render/style.js ORIGINIUM). */
export const ORIGINIUM = Object.freeze({
  base: Object.freeze([0.16, 0.05, 0.05] as const),
  crust: Object.freeze([0.3, 0.1, 0.07] as const),
  vein: Object.freeze([1.0, 0.46, 0.18] as const),
  spec: Object.freeze([1.0, 0.78, 0.52] as const),
})

/** The stage's background plane: size, height and how many mirrored copies surround it (tiles). */
export const BACKDROP = Object.freeze({ z: -8, size: 43.16, color: 0.713, dim: 0.8, tiles: 3 })
