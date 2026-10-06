import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"

const repoRoot = fileURLToPath(new URL("..", import.meta.url))
const clientRoot = fileURLToPath(new URL("./client", import.meta.url))

export default defineConfig({
  root: clientRoot,
  resolve: {
    conditions: ["source"],
  },
  server: {
    port: 5173,
    fs: {
      allow: [repoRoot],
    },
  },
  build: {
    outDir: "dist-web",
    emptyOutDir: true,
    sourcemap: true,
  },
})
