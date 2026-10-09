// 棋盘贴图的 PNG 编解码，只支持 8 位、非隔行的图像，用于裁切与像素统计。

import { deflateSync, inflateSync } from "node:zlib"

export type PixelRect = readonly [number, number, number, number]

export interface PngImage {
  readonly w: number
  readonly h: number
  readonly rgba: Buffer
}

export interface RectStats {
  readonly opaque: number
  readonly mean: number
  readonly std: number
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

/** Encodes RGBA pixels as an 8-bit RGBA PNG. */
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

/** Opacity, mean and standard deviation of the luminance of a rectangle, sampled every second pixel. */
export function rectStats(img: PngImage, rect: PixelRect): RectStats {
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
