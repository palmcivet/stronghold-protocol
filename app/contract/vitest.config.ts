import { moduleTest } from "../../vitest.shared.ts"

export default moduleTest("app-contract", {
  environment: "node",
  include: ["**/*.test.ts", "**/*.spec.ts"],
})
