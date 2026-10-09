// 棋盘图集上每个三维表面的像素矩形。裁切器据此校验并写入 tiles.json 的 board3d。

import type { PixelRect } from "#compiler/media/derive/board/png.js"

export type BoardSourceName = "D" | "common"

export interface BoardSurface {
  readonly src: BoardSourceName
  readonly rect: PixelRect
  readonly rot?: 0 | 90 | 180 | 270
  readonly flipX?: boolean
  readonly tint?: string
}

const surface = (src: BoardSourceName, rect: PixelRect, extra?: Omit<BoardSurface, "src" | "rect">): BoardSurface =>
  extra ? { src, rect, ...extra } : { src, rect }

export const BOARD_SURFACES: { readonly [name: string]: BoardSurface } = Object.freeze({
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
  crateTop: surface("D", [1222, 1938, 134, 108], { rot: 90 }),
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
