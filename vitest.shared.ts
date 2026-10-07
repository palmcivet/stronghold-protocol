import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const repoRoot = fileURLToPath(new URL(".", import.meta.url))

interface ModuleTestOptions {
  readonly environment?: "node" | "jsdom" | "happy-dom"
  readonly include?: readonly string[]
}

export function moduleTest(name: string, options: ModuleTestOptions = {}) {
  return defineConfig({
    resolve: {
      conditions: ["source", "import", "module", "default"],
    },
    ssr: {
      resolve: {
        conditions: ["source", "import", "module", "default"],
      },
    },
    server: {
      fs: {
        allow: [repoRoot],
      },
    },
    test: {
      name,
      environment: options.environment ?? "node",
      include: options.include ? [...options.include] : ["test/**/*.test.ts"],
      server: {
        deps: {
          inline: [/^@alliance\//, /^arknights-/],
        },
      },
    },
  })
}
