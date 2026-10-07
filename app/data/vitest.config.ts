import { moduleTest } from "../../vitest.shared.ts"

export default moduleTest("@alliance/data", {
  environment: "node",
  include: ["**/*.test.ts", "**/*.spec.ts"],
})
