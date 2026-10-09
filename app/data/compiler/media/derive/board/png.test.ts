import { expect, test } from "vitest"
import { decodePng, encodePng } from "#compiler/media/derive/board/png.js"

test("a PNG written by encodePng decodes to the same pixels", () => {
  const rgba = Buffer.from([
    255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255,
    10, 20, 30, 128, 40, 50, 60, 255, 70, 80, 90, 0,
  ])
  const decoded = decodePng(encodePng(3, 2, rgba))
  expect([decoded.w, decoded.h]).toEqual([3, 2])
  expect(Buffer.from(decoded.rgba)).toEqual(rgba)
})
