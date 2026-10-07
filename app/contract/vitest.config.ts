import { moduleTest } from "../../vitest.shared.ts"

export default moduleTest("@alliance/contract", {
  environment: "node",
  include: ["**/*.test.ts", "**/*.spec.ts"],
})
