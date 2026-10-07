import { moduleTest } from "../../vitest.shared.ts"

export default moduleTest("app-data", {
  environment: "node",
  include: ["**/*.test.ts", "**/*.spec.ts"],
})
