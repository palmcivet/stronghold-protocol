import { join } from "node:path"
import { defineConfig } from "vite"
import { dataWorkspace } from "@alliance/data/workspace"
import { devResourcesPlugin } from "./vite-plugins"

const workspace = dataWorkspace()
const catalog = workspace.catalog
const repoRoot = workspace.workspaceRoot
const clientRoot = join(repoRoot, "app", "client")

export default defineConfig({
  root: clientRoot,
  plugins: [devResourcesPlugin({
    productRoot: workspace.productDir,
    mediaRoot: catalog.mediaDir,
    fontRoot: catalog.fontDir,
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
