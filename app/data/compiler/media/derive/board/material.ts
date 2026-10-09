// 棋盘材质表：每个材质由图集上的矩形与可选的叠加层组成。矩形以像素计，相对于 ATLAS_SOURCES 中对应的贴图。

import { formatAssetKey, type AssetKey } from "arknights-assets-catalog"
import type { PixelRect } from "#compiler/media/derive/board/png.js"

/** Theme directory of the board textures under `map/`. */
export const BOARD_THEME = "autochess"

export type AtlasSourceName = "D" | "common" | "BG"

export interface AtlasSource {
  readonly key: AssetKey
  readonly w: number
  readonly h: number
}

const boardTexture = (name: string): AssetKey => formatAssetKey("texture", `map/${BOARD_THEME}/${name}`)

/** Board textures the atlas is cropped from, by source name. */
export const ATLAS_SOURCES: Readonly<Record<AtlasSourceName, AtlasSource>> = Object.freeze({
  D: { key: boardTexture("TX_autochessi_D"), w: 2048, h: 2048 },
  common: { key: boardTexture("TX_autochessi_common_D"), w: 1024, h: 1024 },
  BG: { key: boardTexture("TX_autochessi_BG"), w: 1024, h: 1024 },
})

/** Keys of every board texture, which the season pack lists as optional needs. */
export const BOARD_TEXTURE_KEYS: readonly AssetKey[] = Object.freeze(Object.values(ATLAS_SOURCES).map((source) => source.key))

export interface ProcLayer {
  readonly proc: "rim"
}

export interface CropLayer {
  readonly src: "D" | "common"
  readonly rect: PixelRect
  readonly rot?: 0 | 90 | 180 | 270
  readonly flipX?: boolean
  readonly flipY?: boolean
  readonly scale?: number
  readonly alpha?: number
  readonly tint?: string
  readonly bright?: number
}

export type MaterialLayer = ProcLayer | CropLayer

const layer = (src: "D" | "common", rect: PixelRect, extra?: Omit<CropLayer, "src" | "rect">): CropLayer =>
  extra ? { src, rect, ...extra } : { src, rect }

const RECTS = {
  concrete: [256, 512, 256, 256],
  concreteFrame: [256, 256, 256, 256],
  concreteStripe: [512, 256, 256, 256],
  concreteArrow: [768, 256, 256, 256],
  concreteRed: [768, 512, 256, 256],
  plateL: [0, 0, 256, 256],
  plateM: [256, 0, 256, 256],
  plateR: [512, 0, 256, 256],
  plateS: [768, 0, 256, 256],
  goldSide: [0, 1664, 272, 114],
  graySide: [272, 1664, 272, 82],
  sepSide: [196, 768, 300, 160],
  mech: [1088, 705, 304, 304],
  slats: [1032, 477, 226, 226],
  hatch: [556, 1788, 236, 236],
  lift: [804, 1790, 234, 234],
  ringHatch: [1290, 1400, 210, 210],
  padReinf: [0, 1024, 512, 512],
  padEquip: [512, 1024, 512, 512],
  benchRail: [0, 1538, 512, 82],
  crateFace: [1087, 1938, 134, 108],
  crateFace2: [1222, 1938, 134, 108],
} as const satisfies Record<string, PixelRect>

const COMMON_RECTS = {
  hazardX: [2, 2, 250, 248],
  heal: [264, 2, 256, 250],
  shield: [538, 2, 256, 250],
  target: [2, 262, 250, 250],
  blast: [538, 262, 250, 250],
  enemyMark: [792, 258, 232, 262],
  fast: [2, 520, 250, 250],
} as const satisfies Record<string, PixelRect>

const RIM: ProcLayer = { proc: "rim" }

export const MATERIALS: { readonly [name: string]: readonly MaterialLayer[] } = {
  road: [layer("D", RECTS.concrete)],
  road2: [layer("D", RECTS.concrete, { rot: 90 })],
  road3: [layer("D", RECTS.concrete, { rot: 180, bright: 0.97 })],
  roadN: [layer("D", RECTS.concrete, { rot: 270, bright: 0.93 })],
  roadN2: [layer("D", RECTS.concrete, { flipX: true, bright: 0.93 })],
  floor: [layer("D", RECTS.concreteRed)],
  floor2: [layer("D", RECTS.concreteRed, { flipX: true })],
  preview: [layer("D", RECTS.concreteStripe, { bright: 0.9 })],
  wall: [layer("D", RECTS.plateS)],
  wallL: [layer("D", RECTS.plateL)],
  wallM: [layer("D", RECTS.plateM)],
  wallR: [layer("D", RECTS.plateR)],
  wallB: [layer("D", RECTS.plateL, { rot: 270 })],
  wallVM: [layer("D", RECTS.plateM, { rot: 90 })],
  wallT: [layer("D", RECTS.plateL, { rot: 90 })],
  wallSide: [layer("D", RECTS.goldSide, { bright: 0.92 })],
  forbid: [layer("D", RECTS.concrete, { tint: "#6a7075" }), RIM],
  forbid2: [layer("D", RECTS.concrete, { rot: 90, tint: "#646a6f" }), RIM],
  forbidSide: [layer("D", RECTS.graySide, { tint: "#6d767b" })],
  sep: [layer("D", RECTS.slats, { tint: "#5a6266" }), RIM],
  sepSide: [layer("D", RECTS.sepSide, { bright: 0.8 })],
  fence: [layer("D", RECTS.hatch)],
  start: [layer("D", RECTS.concreteArrow), layer("common", COMMON_RECTS.enemyMark, { scale: 0.5, alpha: 0.85 })],
  end: [layer("D", RECTS.ringHatch), layer("common", COMMON_RECTS.shield, { scale: 0.46, alpha: 0.9, tint: "#6fc3ff" })],
  telin: [layer("D", RECTS.lift)],
  telout: [layer("D", RECTS.lift, { rot: 180 })],
  hand: [layer("D", RECTS.padReinf)],
  temp: [layer("D", RECTS.padEquip)],
  benchSide: [layer("D", RECTS.benchRail)],
  benchSideTemp: [layer("D", RECTS.benchRail, { flipX: true })],
  smog: [layer("D", RECTS.slats, { tint: "#7c8589" })],
  crateSide: [layer("D", RECTS.crateFace)],
  crateTop: [layer("D", RECTS.crateFace2, { rot: 90, bright: 1.08 })],
  blowerTop: [layer("D", RECTS.mech, { tint: "#6b7478" }), layer("common", COMMON_RECTS.fast, { scale: 0.92 })],
  sealed: [layer("common", COMMON_RECTS.hazardX)],
  turretTop: [layer("D", RECTS.mech, { rot: 180, tint: "#737c80" }), layer("common", COMMON_RECTS.target, { scale: 0.9 })],
  platformTop: [layer("D", RECTS.plateS, { bright: 1.06 })],
}

export const BACKDROP: { readonly src: "BG"; readonly tilesPerRepeat: number; readonly crop: PixelRect } = {
  src: "BG",
  tilesPerRepeat: 9,
  crop: [0, 0, 1024, 440],
}
