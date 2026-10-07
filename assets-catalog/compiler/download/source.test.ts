import { expect, test } from "vitest"
import { encodePath, mirrorUrl, safeName } from "#compiler/download/source.js"

test("mirror, path encoding and safe file names", () => {
  expect(mirrorUrl("https://raw.githubusercontent.com/fexli/ArknightsResource/main/spine/a/b.skel")).toBe(
    "https://cdn.jsdelivr.net/gh/fexli/ArknightsResource@main/spine/a/b.skel",
  )
  expect(mirrorUrl("https://raw.githubusercontent.com/ArknightsAssets/ArknightsAssets2/voice/assets/x.mp3")).toBeNull()
  expect(mirrorUrl("https://example.com/x")).toBeNull()
  expect(encodePath("[uc]a/b c#.png")).toBe("%5Buc%5Da/b%20c%23.png")
  expect(safeName("skcom_charge_cost[3]")).toBe("skcom_charge_cost_3_")
  expect(safeName("bg_open 1")).toBe("bg_open_1")
})
