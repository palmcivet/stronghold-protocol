// 从卫戍协议棋盘图集裁出每个材质的矩形，校验覆盖和对比度，写出 tiles.json。
// board3d 表面表在 surface.ts。

import { writeFile } from "node:fs/promises"
import { relative, resolve, sep } from "node:path"
import { join } from "node:path"
import { deflateSync, inflateSync } from "node:zlib"
import { catalogPackageRoot } from "arknights-assets-catalog/compile"
import type { CatalogFiles } from "arknights-assets-catalog"
import { boardSurfaces, type BoardSurface } from "./surface.js"

const root = catalogPackageRoot()
const mediaRoot = join(root, "product", "media")

export interface AtlasSource {
  readonly file: string
  readonly w: number
  readonly h: number
}

export const atlasSources: Readonly<Record<string, AtlasSource>> = Object.freeze({
  D: { file: "TX_autochessi_D.png", w: 2048, h: 2048 },
  common: { file: "TX_autochessi_common_D.png", w: 1024, h: 1024 },
  BG: { file: "TX_autochessi_BG.png", w: 1024, h: 1024 },
})

type Rect = readonly [number, number, number, number]

export interface ProcLayer {
  readonly proc: "rim"
}

export interface CropLayer {
  readonly src: "D" | "common"
  readonly rect: Rect
  readonly rot?: 0 | 90 | 180 | 270
  readonly flipX?: boolean
  readonly flipY?: boolean
  readonly scale?: number
  readonly alpha?: number
  readonly tint?: string
  readonly bright?: number
}

export type MaterialLayer = ProcLayer | CropLayer

const layer = (src: "D" | "common", rect: Rect, extra?: Omit<CropLayer, "src" | "rect">): CropLayer =>
  extra ? { src, rect, ...extra } : { src, rect }

const rects = {
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
} as const satisfies Record<string, Rect>

const commonRects = {
  hazardX: [2, 2, 250, 248],
  heal: [264, 2, 256, 250],
  shield: [538, 2, 256, 250],
  target: [2, 262, 250, 250],
  blast: [538, 262, 250, 250],
  enemyMark: [792, 258, 232, 262],
  fast: [2, 520, 250, 250],
} as const satisfies Record<string, Rect>

const rim: ProcLayer = { proc: "rim" }

export const materials: { readonly [name: string]: readonly MaterialLayer[] } = {
  road: [layer("D", rects.concrete)],
  road2: [layer("D", rects.concrete, { rot: 90 })],
  road3: [layer("D", rects.concrete, { rot: 180, bright: 0.97 })],
  roadN: [layer("D", rects.concrete, { rot: 270, bright: 0.93 })],
  roadN2: [layer("D", rects.concrete, { flipX: true, bright: 0.93 })],
  floor: [layer("D", rects.concreteRed)],
  floor2: [layer("D", rects.concreteRed, { flipX: true })],
  preview: [layer("D", rects.concreteStripe, { bright: 0.9 })],
  wall: [layer("D", rects.plateS)],
  wallL: [layer("D", rects.plateL)],
  wallM: [layer("D", rects.plateM)],
  wallR: [layer("D", rects.plateR)],
  wallB: [layer("D", rects.plateL, { rot: 270 })],
  wallVM: [layer("D", rects.plateM, { rot: 90 })],
  wallT: [layer("D", rects.plateL, { rot: 90 })],
  wallSide: [layer("D", rects.goldSide, { bright: 0.92 })],
  forbid: [layer("D", rects.concrete, { tint: "#6a7075" }), rim],
  forbid2: [layer("D", rects.concrete, { rot: 90, tint: "#646a6f" }), rim],
  forbidSide: [layer("D", rects.graySide, { tint: "#6d767b" })],
  sep: [layer("D", rects.slats, { tint: "#5a6266" }), rim],
  sepSide: [layer("D", rects.sepSide, { bright: 0.8 })],
  fence: [layer("D", rects.hatch)],
  start: [layer("D", rects.concreteArrow), layer("common", commonRects.enemyMark, { scale: 0.5, alpha: 0.85 })],
  end: [layer("D", rects.ringHatch), layer("common", commonRects.shield, { scale: 0.46, alpha: 0.9, tint: "#6fc3ff" })],
  telin: [layer("D", rects.lift)],
  telout: [layer("D", rects.lift, { rot: 180 })],
  hand: [layer("D", rects.padReinf)],
  temp: [layer("D", rects.padEquip)],
  benchSide: [layer("D", rects.benchRail)],
  benchSideTemp: [layer("D", rects.benchRail, { flipX: true })],
  smog: [layer("D", rects.slats, { tint: "#7c8589" })],
  crateSide: [layer("D", rects.crateFace)],
  crateTop: [layer("D", rects.crateFace2, { rot: 90, bright: 1.08 })],
  blowerTop: [layer("D", rects.mech, { tint: "#6b7478" }), layer("common", commonRects.fast, { scale: 0.92 })],
  sealed: [layer("common", commonRects.hazardX)],
  turretTop: [layer("D", rects.mech, { rot: 180, tint: "#737c80" }), layer("common", commonRects.target, { scale: 0.9 })],
  platformTop: [layer("D", rects.plateS, { bright: 1.06 })],
}

export const backdrop: { readonly src: string; readonly tilesPerRepeat: number; readonly crop: Rect } = {
  src: "BG",
  tilesPerRepeat: 9,
  crop: [0, 0, 1024, 440],
}

export interface PngImage {
  readonly w: number
  readonly h: number
  readonly rgba: Buffer
}

function byte(buf: Buffer, index: number): number {
  const value = buf[index]
  if (value === undefined) throw new Error("truncated PNG")
  return value
}

export function pngSize(buf: Buffer): { readonly w: number; readonly h: number } {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG")
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
}

export function decodePng(buf: Buffer): PngImage {
  const { w, h } = pngSize(buf)
  let off = 8
  let depth = 0
  let ctype = 0
  let inter = 0
  let palette: Buffer | null = null
  const idat: Buffer[] = []
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString("ascii", off + 4, off + 8)
    const data = buf.subarray(off + 8, off + 8 + len)
    if (type === "IHDR") {
      depth = byte(data, 8)
      ctype = byte(data, 9)
      inter = byte(data, 12)
    } else if (type === "PLTE") palette = data
    else if (type === "IDAT") idat.push(data)
    else if (type === "IEND") break
    off += 12 + len
  }
  if (depth !== 8 || inter !== 0) throw new Error(`unsupported PNG (depth ${depth}, interlace ${inter})`)
  const channels: Readonly<Record<number, number | undefined>> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }
  const channel = channels[ctype]
  if (!channel) throw new Error(`unsupported colour type ${ctype}`)
  const raw = inflateSync(Buffer.concat(idat))
  const stride = w * channel
  const out = Buffer.alloc(w * h * 4)
  const prev = Buffer.alloc(stride)
  const cur = Buffer.alloc(stride)
  for (let y = 0; y < h; y++) {
    const filter = byte(raw, y * (stride + 1))
    raw.copy(cur, 0, y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let i = 0; i < stride; i++) {
      const left = i >= channel ? byte(cur, i - channel) : 0
      const up = byte(prev, i)
      const upperLeft = i >= channel ? byte(prev, i - channel) : 0
      let value = byte(cur, i)
      if (filter === 1) value += left
      else if (filter === 2) value += up
      else if (filter === 3) value += (left + up) >> 1
      else if (filter === 4) {
        const estimate = left + up - upperLeft
        const pa = Math.abs(estimate - left)
        const pb = Math.abs(estimate - up)
        const pc = Math.abs(estimate - upperLeft)
        value += pa <= pb && pa <= pc ? left : pb <= pc ? up : upperLeft
      }
      cur[i] = value & 255
    }
    for (let x = 0; x < w; x++) {
      const dest = (y * w + x) * 4
      const source = x * channel
      if (ctype === 6) {
        out[dest] = byte(cur, source)
        out[dest + 1] = byte(cur, source + 1)
        out[dest + 2] = byte(cur, source + 2)
        out[dest + 3] = byte(cur, source + 3)
      } else if (ctype === 2) {
        out[dest] = byte(cur, source)
        out[dest + 1] = byte(cur, source + 1)
        out[dest + 2] = byte(cur, source + 2)
        out[dest + 3] = 255
      } else if (ctype === 3) {
        if (!palette) throw new Error("PNG palette missing")
        const index = byte(cur, source) * 3
        out[dest] = byte(palette, index)
        out[dest + 1] = byte(palette, index + 1)
        out[dest + 2] = byte(palette, index + 2)
        out[dest + 3] = 255
      } else if (ctype === 4) {
        const gray = byte(cur, source)
        out[dest] = gray
        out[dest + 1] = gray
        out[dest + 2] = gray
        out[dest + 3] = byte(cur, source + 1)
      } else {
        const gray = byte(cur, source)
        out[dest] = gray
        out[dest + 1] = gray
        out[dest + 2] = gray
        out[dest + 3] = 255
      }
    }
    cur.copy(prev)
  }
  return { w, h, rgba: out }
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff
  for (let n = 0; n < buf.length; n++) {
    let c = (crc ^ byte(buf, n)) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = (crc >>> 8) ^ c
  }
  return (crc ^ 0xffffffff) >>> 0
}

export function encodePng(w: number, h: number, rgba: Buffer): Buffer {
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, "ascii"), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([len, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ])
}

export interface RectStats {
  readonly opaque: number
  readonly mean: number
  readonly std: number
}

export function rectStats(img: PngImage, rect: Rect): RectStats {
  const [x, y, w, h] = rect
  let n = 0
  let opaque = 0
  let sum = 0
  let square = 0
  for (let yy = y; yy < y + h; yy += 2) {
    for (let xx = x; xx < x + w; xx += 2) {
      const offset = (yy * img.w + xx) * 4
      const luminance = 0.299 * byte(img.rgba, offset) + 0.587 * byte(img.rgba, offset + 1) + 0.114 * byte(img.rgba, offset + 2)
      n++
      if (byte(img.rgba, offset + 3) > 200) opaque++
      sum += luminance
      square += luminance * luminance
    }
  }
  const mean = n ? sum / n : 0
  return { opaque: n ? opaque / n : 0, mean, std: Math.sqrt(Math.max(0, (n ? square / n : 0) - mean * mean)) }
}

interface CropOptions {
  readonly dir: string
  readonly preview: string | null
  readonly check: boolean
}

function parseCropArgs(argv: readonly string[]): CropOptions {
  let dir = "product/media/local/map/autochess"
  let preview: string | null = null
  let check = false
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg?.startsWith("--")) continue
    const key = arg.slice(2)
    const next = argv[i + 1]
    const value = next && !next.startsWith("--") ? argv[++i] : true
    if (key === "dir" && typeof value === "string") dir = value
    else if (key === "preview" && typeof value === "string") preview = value
    else if (key === "check") check = true
  }
  return { dir: resolve(root, dir), preview, check }
}

function isCrop(layer: MaterialLayer): layer is CropLayer {
  return !("proc" in layer)
}

export async function cropBoardAtlas(files: CatalogFiles, argv: readonly string[]): Promise<number> {
    const options = parseCropArgs(argv)
    const urlBase = "/assets/" + relative(mediaRoot, options.dir).split(sep).join("/")
    const problems: string[] = []
    const source: Record<string, { path: string; w: number; h: number }> = {}
    const images: Record<string, PngImage | undefined> = {}
    for (const [key, spec] of Object.entries(atlasSources)) {
      const file = join(options.dir, spec.file)
      if (!(await files.exists(file))) {
        problems.push(`missing ${relative(root, file)}`)
        continue
      }
      const buf = Buffer.from(await files.readBytes(file))
      try {
        const size = pngSize(buf)
        if (size.w !== spec.w || size.h !== spec.h) problems.push(`${spec.file}: ${size.w}×${size.h}, expected ${spec.w}×${spec.h}`)
        source[key] = { path: `${urlBase}/${spec.file}`, w: size.w, h: size.h }
        images[key] = decodePng(buf)
      } catch (cause) {
        problems.push(`${spec.file}: ${cause instanceof Error ? cause.message : String(cause)}`)
      }
    }
    if (!source["D"]) {
      console.error(`[crop-board-atlas] ${problems.join("; ")} — run the local extractor first (the art is optional).`)
      return options.check ? 1 : 0
    }
    const report: string[] = []
    for (const [name, layers] of Object.entries(materials)) {
      for (const row of layers) {
        if (!isCrop(row)) continue
        const image = images[row.src]
        const [x, y, w, h] = row.rect
        const spec = atlasSources[row.src]
        if (!spec || !(x >= 0 && y >= 0 && w > 8 && h > 8 && x + w <= spec.w && y + h <= spec.h)) {
          problems.push(`${name}: rect ${row.rect.join(",")} outside ${row.src}`)
          continue
        }
        if (!image) continue
        const stats = rectStats(image, row.rect)
        report.push(
          `${name.padEnd(14)} ${row.src.padEnd(6)} [${row.rect.join(",")}]  opaque ${(stats.opaque * 100).toFixed(0)}%  mean ${stats.mean.toFixed(0)}  std ${stats.std.toFixed(1)}`,
        )
        const decal = row !== layers[0] || row.scale != null
        if (!decal && stats.opaque < 0.9) problems.push(`${name}: rect ${row.rect.join(",")} of ${row.src} is ${(100 - stats.opaque * 100).toFixed(0)}% transparent`)
        if (decal && stats.opaque < 0.05) problems.push(`${name}: decal rect ${row.rect.join(",")} of ${row.src} is empty`)
        if (stats.std < 2) problems.push(`${name}: rect ${row.rect.join(",")} of ${row.src} is flat (std ${stats.std.toFixed(1)})`)
      }
    }
    for (const [name, surface] of Object.entries(boardSurfaces)) {
      const spec = atlasSources[surface.src]
      const [x, y, w, h] = surface.rect
      if (!spec || !(x >= 0 && y >= 0 && w > 8 && h > 8 && x + w <= spec.w && y + h <= spec.h)) {
        problems.push(`board3d ${name}: rect ${surface.rect.join(",")} outside ${surface.src}`)
        continue
      }
      const image = images[surface.src]
      if (!image) continue
      const stats = rectStats(image, surface.rect)
      report.push(
        `3d ${name.padEnd(12)} ${surface.src.padEnd(6)} [${surface.rect.join(",")}]  opaque ${(stats.opaque * 100).toFixed(0)}%  mean ${stats.mean.toFixed(0)}  std ${stats.std.toFixed(1)}`,
      )
      if (surface.src === "D" && stats.opaque < 0.9) problems.push(`board3d ${name}: rect ${surface.rect.join(",")} is ${(100 - stats.opaque * 100).toFixed(0)}% transparent`)
      if (surface.src === "common" && stats.opaque < 0.05) problems.push(`board3d ${name}: decal rect ${surface.rect.join(",")} is empty`)
      if (stats.std < 2) problems.push(`board3d ${name}: rect ${surface.rect.join(",")} is flat (std ${stats.std.toFixed(1)})`)
    }
    console.log(report.join("\n"))
    if (problems.length) console.warn("[crop-board-atlas] problems:\n  " + problems.join("\n  "))
    if (options.check) return problems.length ? 1 : 0
    const board3d = Object.fromEntries(
      Object.entries(boardSurfaces).map(([key, surface]) => [key, copySurface(surface)]),
    )
    const out = {
      version: 2,
      generatedBy: "app/data/compiler/media/board/atlas.ts",
      cell: 256,
      source,
      materials,
      backdrop: source["BG"] ? backdrop : null,
      board3d,
    }
    const file = join(options.dir, "tiles.json")
    await files.writeTextAtomic(file, JSON.stringify(out, null, 1) + "\n")
    console.log(`wrote ${relative(root, file)} (${Object.keys(materials).length} materials, ${Object.keys(board3d).length} 3D surfaces)`)
    const previewPath = options.preview
    if (previewPath) {
      const names = Object.keys(materials)
      const cols = 8
      const cell = 128
      const width = cols * cell
      const height = Math.ceil(names.length / cols) * cell
      const sheet = Buffer.alloc(width * height * 4, 0)
      names.forEach((name, index) => {
        const first = materials[name]?.[0]
        if (!first || !isCrop(first)) return
        const image = images[first.src]
        if (!image) return
        const [x, y, w, h] = first.rect
        const ox = (index % cols) * cell
        const oy = Math.floor(index / cols) * cell
        for (let yy = 2; yy < cell - 2; yy++) {
          for (let xx = 2; xx < cell - 2; xx++) {
            const sx = x + Math.floor(((xx - 2) / (cell - 4)) * w)
            const sy = y + Math.floor(((yy - 2) / (cell - 4)) * h)
            const sourceOffset = (sy * image.w + sx) * 4
            const dest = ((oy + yy) * width + ox + xx) * 4
            image.rgba.copy(sheet, dest, sourceOffset, sourceOffset + 4)
          }
        }
      })
      await writeFile(resolve(previewPath), encodePng(width, height, sheet))
      console.log(`preview → ${previewPath}`)
    }
    return 0
}

function copySurface(surface: BoardSurface): { src: BoardSurface["src"]; rect: number[]; rot?: BoardSurface["rot"]; flipX?: boolean; tint?: string } {
  const copy: { src: BoardSurface["src"]; rect: number[]; rot?: BoardSurface["rot"]; flipX?: boolean; tint?: string } = {
    src: surface.src,
    rect: [...surface.rect],
  }
  if (surface.rot !== undefined) copy.rot = surface.rot
  if (surface.flipX !== undefined) copy.flipX = surface.flipX
  if (surface.tint !== undefined) copy.tint = surface.tint
  return copy
}
