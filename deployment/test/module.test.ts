import { moduleId } from "stronghold-deployment"
import { expect, test } from "vitest"

test("deployment resolves", () => {
  expect(moduleId).toBe("stronghold-deployment")
})
