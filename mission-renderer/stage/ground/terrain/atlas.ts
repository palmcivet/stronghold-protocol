export const TERRAIN_ATLAS_SOURCES = Object.freeze({
  D: Object.freeze({ w: 2048, h: 2048 }),
  common: Object.freeze({ w: 1024, h: 1024 }),
})

export type TerrainAtlasSource = keyof typeof TERRAIN_ATLAS_SOURCES

export type Rect = readonly [number, number, number, number]

export interface TerrainSurface {
  readonly src: TerrainAtlasSource
  readonly rect: Rect
  readonly rot: number
  readonly flipX: boolean
  readonly tint?: string
}

export type TerrainUvTable = Readonly<Record<string, TerrainSurface>>

const surface = (src: TerrainAtlasSource, rect: Rect, rot = 0): TerrainSurface => ({ src, rect, rot, flipX: false })

/** Surface name → atlas region of `tiles.json` `board3d` (master board3d/atlas.js SURFACES). */
export const TERRAIN_SURFACES: TerrainUvTable = Object.freeze({
  concrete: surface("D", [256, 512, 256, 256]),
  concreteRailTL: surface("D", [0, 256, 256, 256]),
  concreteRailT: surface("D", [256, 256, 256, 256]),
  concreteRailL: surface("D", [0, 512, 256, 256]),
  concreteStripe: surface("D", [512, 256, 256, 256]),
  concreteArrow: surface("D", [768, 256, 256, 256]),
  concreteRed: surface("D", [768, 512, 256, 256]),
  hatch: surface("D", [549, 1787, 255, 256]),
  lift: surface("D", [804, 1790, 234, 234]),
  ringHatch: surface("D", [1290, 1400, 190, 190]),
  slats: surface("D", [1036, 480, 404, 216]),
  mech: surface("D", [1088, 708, 356, 310]),
  steel: surface("D", [12, 776, 196, 196]),
  plateL: surface("D", [0, 0, 256, 256]),
  plateM: surface("D", [256, 0, 256, 256]),
  plateR: surface("D", [512, 0, 256, 256]),
  plateS: surface("D", [768, 0, 256, 256]),
  padReinf: surface("D", [0, 1024, 512, 512]),
  padEquip: surface("D", [512, 1024, 512, 512]),
  goldSide: surface("D", [0, 1664, 272, 384]),
  graySide: surface("D", [272, 1664, 272, 384]),
  benchRail: surface("D", [0, 1538, 512, 98]),
  restPanel: surface("D", [0, 768, 512, 208]),
  evacPanel: surface("D", [512, 768, 256, 208]),
  pipePanel: surface("D", [544, 1540, 480, 244]),
  crateSide: surface("D", [1087, 1938, 134, 108]),
  crateTop: surface("D", [1222, 1938, 134, 108], 90),
  hazardX: surface("common", [2, 2, 250, 248]),
  heal: surface("common", [264, 2, 256, 250]),
  shield: surface("common", [538, 2, 256, 250]),
  target: surface("common", [2, 262, 250, 250]),
  blast: surface("common", [538, 262, 250, 250]),
  enemyMark: surface("common", [792, 258, 232, 262]),
  fast: surface("common", [2, 520, 250, 250]),
  arrowUp: surface("common", [508, 762, 244, 244]),
  arrowDown: surface("common", [776, 762, 244, 244]),
})

const QUARTER_TURNS = [0, 90, 180, 270] as const

/** A `tiles.json` surface record → a valid surface, or null when its source or rectangle is invalid. */
export function cleanSurface(value: unknown): TerrainSurface | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const record = value as { src?: unknown, rect?: unknown, rot?: unknown, flipX?: unknown, tint?: unknown }
  if (record.src !== "D" && record.src !== "common") return null
  if (!Array.isArray(record.rect) || record.rect.length !== 4) return null
  const [x, y, w, h] = record.rect.map(Number)
  if (x === undefined || y === undefined || w === undefined || h === undefined) return null
  const source = TERRAIN_ATLAS_SOURCES[record.src]
  if (![x, y, w, h].every(Number.isFinite) || w < 4 || h < 4 || x < 0 || y < 0 || x + w > source.w || y + h > source.h) {
    return null
  }
  const rot = QUARTER_TURNS.find((turn) => turn === record.rot) ?? 0
  const tint = typeof record.tint === "string" && /^#[0-9a-f]{6}$/i.test(record.tint) ? record.tint : undefined
  return {
    src: record.src,
    rect: [x, y, w, h],
    rot,
    flipX: Boolean(record.flipX),
    ...(tint ? { tint } : {}),
  }
}

/** The built-in surface table, replaced entry by entry by a valid `board3d` section of `tiles.json`. */
export function resolveUvTable(tiles: unknown): TerrainUvTable {
  const out: Record<string, TerrainSurface> = {}
  for (const [key, value] of Object.entries(TERRAIN_SURFACES)) {
    const cleaned = cleanSurface(value)
    if (cleaned) out[key] = cleaned
  }
  const extra = tiles && typeof tiles === "object" && !Array.isArray(tiles)
    ? (tiles as { board3d?: unknown }).board3d
    : null
  if (extra && typeof extra === "object" && !Array.isArray(extra)) {
    for (const [key, value] of Object.entries(extra)) {
      const cleaned = cleanSurface(value)
      if (cleaned) out[key] = cleaned
    }
  }
  return out
}

/** Bilinear UV at fractions (right, far) of a face whose corner UVs are [BL, BR, TR, TL]. */
export function uvAt(uv: readonly number[], fx: number, fy: number): readonly [number, number] {
  const bottomU = (uv[0] ?? 0) + ((uv[2] ?? 0) - (uv[0] ?? 0)) * fx
  const bottomV = (uv[1] ?? 0) + ((uv[3] ?? 0) - (uv[1] ?? 0)) * fx
  const topU = (uv[6] ?? 0) + ((uv[4] ?? 0) - (uv[6] ?? 0)) * fx
  const topV = (uv[7] ?? 0) + ((uv[5] ?? 0) - (uv[7] ?? 0)) * fx
  return [bottomU + (topU - bottomU) * fy, bottomV + (topV - bottomV) * fy]
}

/**
 * UV corners [BL, BR, TR, TL] of a surface on a quad. `sub` = [u0, v0, u1, v1] crops the rect (fractions, v down).
 * `inset` (source px) keeps mip filtering inside the region.
 */
export function surfaceUV(
  surfaceRecord: TerrainSurface,
  sub: Rect | null = null,
  inset = 2,
): readonly number[] {
  const source = TERRAIN_ATLAS_SOURCES[surfaceRecord.src]
  let [x, y, w, h] = surfaceRecord.rect
  if (sub) {
    const [u0, v0, u1, v1] = sub
    x += w * u0
    y += h * v0
    w *= u1 - u0
    h *= v1 - v0
  }
  const insetX = Math.min(inset, w / 4)
  const insetY = Math.min(inset, h / 4)
  const left = (x + insetX) / source.w
  const right = (x + w - insetX) / source.w
  const top = 1 - (y + insetY) / source.h
  const bottom = 1 - (y + h - insetY) / source.h
  let corners: [number, number][] = [[left, bottom], [right, bottom], [right, top], [left, top]]
  if (surfaceRecord.flipX) corners = [corners[1]!, corners[0]!, corners[3]!, corners[2]!]
  const turns = ((Math.round(surfaceRecord.rot) / 90) % 4 + 4) % 4
  for (let turn = 0; turn < turns; turn += 1) {
    corners = [corners[1]!, corners[2]!, corners[3]!, corners[0]!]
  }
  return corners.flat()
}

/** The sub-rect (fractions) of a side panel that keeps the texture undistorted on a `width` × `height` face. */
export function sideRect(surfaceRecord: TerrainSurface, width: number, height: number): Rect {
  const [, , rectWidth, rectHeight] = surfaceRecord.rect
  const faceAspect = Math.max(1e-3, height / Math.max(1e-3, width))
  const textureAspect = rectHeight / rectWidth
  if (faceAspect >= textureAspect) return [0, 0, 1, 1]
  return [0, 0, 1, faceAspect / textureAspect]
}

/** The surface turned by `extraRot` degrees (added to its own rotation) and mirrored when `extraFlip`. */
export function orientSurface(surfaceRecord: TerrainSurface, extraRot: number, extraFlip: boolean): TerrainSurface {
  return {
    ...surfaceRecord,
    rot: (((surfaceRecord.rot + extraRot) % 360) + 360) % 360,
    flipX: surfaceRecord.flipX !== extraFlip,
  }
}
