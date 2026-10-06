import { expect, test } from "vitest"
import { moduleId } from "arknights-mission-core"

test("battle core resolves", () => {
  expect(moduleId).toBe("arknights-mission-core")
})
