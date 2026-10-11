import { expect, test } from "vitest"
import { assetColorSpace } from "#schema/color-space.js"

test("an entry's colour space is its own, else sRGB for images and textures, and none for other kinds", () => {
  expect(assetColorSpace({ kind: "image" })).toBe("srgb")
  expect(assetColorSpace({ kind: "texture", colorSpace: "linear" })).toBe("linear")
  expect(assetColorSpace({ kind: "spine" })).toBeNull()
  expect(assetColorSpace({ kind: "audio" })).toBeNull()
})
