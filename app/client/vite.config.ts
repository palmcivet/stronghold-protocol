import { join } from "node:path"
import { defineConfig } from "vite"
import { catalogWorkspace } from "arknights-assets-catalog/compile"
import { dataWorkspace } from "@alliance/data/compiler"
import { devResourcesPlugin } from "./vite-plugins"

const dataWorkspaceRoot = dataWorkspace()
const catalog = catalogWorkspace()
const repoRoot = dataWorkspaceRoot.workspaceRoot
const clientRoot = join(repoRoot, "app", "client")

export default defineConfig({
  root: clientRoot,
  plugins: [devResourcesPlugin({
    productRoot: dataWorkspaceRoot.productDir,
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
