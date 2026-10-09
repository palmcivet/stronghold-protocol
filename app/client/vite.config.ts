import { join } from "node:path"
import { defineConfig } from "vite"
import { dataWorkspace } from "@alliance/data/workspace"
import { devResourcesPlugin } from "./vite-plugins.ts"

const workspace = dataWorkspace()
const repoRoot = workspace.workspaceRoot
const clientRoot = join(repoRoot, "app", "client")

export default defineConfig({
  root: clientRoot,
  plugins: [devResourcesPlugin({
    productDir: workspace.productDir,
    derivedDir: workspace.derivedDir,
    extractedFilesDir: join(workspace.extractCacheDir, "files"),
    localDir: join(clientRoot, "local"),
  })],
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
