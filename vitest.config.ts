import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    projects: [
      "app",
      "assets-catalog",
      "deployment",
      "mission-core",
      "mission-renderer",
    ],
  },
})
