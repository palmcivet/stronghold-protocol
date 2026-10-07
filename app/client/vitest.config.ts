import { moduleTest } from "../../vitest.shared.ts"

export default moduleTest("app-client", {
  environment: "node",
  include: ["**/*.test.ts", "**/*.spec.ts"],
})
