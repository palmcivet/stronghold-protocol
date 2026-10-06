import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const repoRoot = fileURLToPath(new URL(".", import.meta.url))

export function moduleTest(name: string) {
  return defineConfig({
    resolve: {
      conditions: ["source"],
    },
    server: {
      fs: {
        allow: [repoRoot],
      },
    },
    test: {
      name,
      environment: "node",
      include: ["test/**/*.test.ts"],
      server: {
        deps: {
          inline: [/^arknights-/, /^stronghold-/],
        },
      },
    },
  })
}
