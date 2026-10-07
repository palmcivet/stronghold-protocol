import { expect, test } from "vitest"
import { nextArtUrl } from "#runtime/media/address.js"

test("next address skips urls that already failed", () => {
  expect(nextArtUrl(["/assets/ui/guide/page.png", "/assets/ui/guide/fallback.png"], new Set(["/assets/ui/guide/page.png"]))).toBe("/assets/ui/guide/fallback.png")
  expect(nextArtUrl(["/assets/ui/guide/page.png"], new Set(["/assets/ui/guide/page.png"]))).toBeNull()
})
