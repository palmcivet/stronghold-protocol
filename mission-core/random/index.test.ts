import { expect, test } from "vitest"
import { createRandom, deriveSeed } from "arknights-mission-core"

test("种子随机数与 mulberry32 的前几个值一致", () => {
  const random = createRandom(1)
  expect(random()).toBe(0.6270739405881613)
  expect(random()).toBe(0.002735721180215478)
  expect(random()).toBe(0.5274470399599522)
  expect(random()).toBe(0.9810509674716741)
  expect(random()).toBe(0.9683778982143849)
  expect(random.state()).toBe(567894474)
  expect(createRandom(0)()).toBe(0.3588899802416563)
  expect(deriveSeed(1, "field")).toBe(260271553)
  expect(deriveSeed(1, "a")).toBe(1021510540)
})
