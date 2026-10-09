import { moduleTest } from "../vitest.shared.ts"

export default moduleTest("assets-extractor", {
  include: ["**/*.test.ts", "**/*.spec.ts"],
})
