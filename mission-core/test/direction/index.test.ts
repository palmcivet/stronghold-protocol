import { expect, test } from "vitest"
import { rotateOffset } from "arknights-mission-core"

const row = 2
const col = 1

test("同一份相对格按四个朝向旋转", () => {
  expect(rotateOffset(row, col, "RIGHT")).toEqual([row, col])
  expect(rotateOffset(row, col, "UP")).toEqual([col, 0 - row])
  expect(rotateOffset(row, col, "LEFT")).toEqual([0 - row, 0 - col])
  expect(rotateOffset(row, col, "DOWN")).toEqual([0 - col, row])
})
