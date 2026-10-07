import { moduleTest } from "../../vitest.shared.ts"

export default moduleTest("app-server", {
  environment: "node",
  include: ["**/*.test.ts", "**/*.spec.ts"],
})
