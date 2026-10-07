import { moduleTest } from "../../vitest.shared.ts"

export default moduleTest("@alliance/server", {
  environment: "node",
  include: ["**/*.test.ts", "**/*.spec.ts"],
})
