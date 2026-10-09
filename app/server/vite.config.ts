import { join } from "node:path"
import { defineConfig, type UserConfig } from "vite"
import { dataWorkspace } from "@alliance/data/workspace"

const workspace = dataWorkspace()
const repoRoot = workspace.workspaceRoot
const serverRoot = join(repoRoot, "app", "server")
const contractRoot = join(repoRoot, "app", "contract")
const dataRoot = join(repoRoot, "app", "data")
const missionCoreRoot = join(repoRoot, "mission-core")

export default defineConfig((): UserConfig => {
  const isPackaged = process.env.PACKAGE === "true"

  return {
    root: serverRoot,
    resolve: {
      conditions: ["source", "node"],
      alias: [
        { find: "#server", replacement: serverRoot },
        { find: /^@alliance\/contract\/(.+)\.js$/, replacement: `${contractRoot}/src/$1.ts` },
        { find: /^@alliance\/data\/(.+)\.js$/, replacement: `${dataRoot}/$1.ts` },
        { find: "arknights-mission-core", replacement: missionCoreRoot },
      ],
    },
    ...(isPackaged
      ? {
          ssr: {
            noExternal: true,
            external: [],
          },
        }
      : {}),
    build: {
      ssr: "entry/main.ts",
      outDir: isPackaged ? "dist-package" : "dist",
      emptyOutDir: true,
      sourcemap: !isPackaged,
      ...(isPackaged && {
        minify: "oxc",
      }),
      rollupOptions: {
        ...(isPackaged && {
          external: [],
        }),
        output: {
          format: "es",
          entryFileNames: isPackaged ? "server.js" : "entry/main.js",
        },
      },
    },
  }
})
