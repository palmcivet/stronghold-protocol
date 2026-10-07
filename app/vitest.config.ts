import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    projects: [
      "./data/vitest.config.ts",
      "./server/vitest.config.ts",
      "./client/vitest.config.ts",
    ],
  },
})
