import { moduleTest } from "../../vitest.shared.ts"

export default moduleTest("@alliance/client", {
  environment: "node",
  include: ["**/*.test.ts", "**/*.spec.ts"],
})
