import { expect, test } from "vitest"
import { moduleId } from "arknights-assets-catalog"

test("asset catalog resolves", () => {
  expect(moduleId).toBe("arknights-assets-catalog")
})
