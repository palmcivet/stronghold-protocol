import { expect, test } from "vitest"
import { baseNameOf, safeName, stemOf } from "#source/name.js"

test("safe file names", () => {
  expect(safeName("skcom_charge_cost[3]")).toBe("skcom_charge_cost_3_")
  expect(safeName("bg_open 1")).toBe("bg_open_1")
  expect(safeName("char_002_amiya@winter#1")).toBe("char_002_amiya_winter_1")
  expect(safeName("")).toBe("_")
})

test("stems and base names", () => {
  expect(stemOf("spine/a/b/Front/char_002_amiya.skel")).toBe("char_002_amiya")
  expect(stemOf("font/Bender/BenderLight.woff.ttf")).toBe("BenderLight.woff")
  expect(stemOf(".hidden")).toBe(".hidden")
  expect(baseNameOf("a/b/c.png")).toBe("c.png")
  expect(baseNameOf("c.png")).toBe("c.png")
})
