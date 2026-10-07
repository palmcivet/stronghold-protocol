import { fileURLToPath } from "node:url"
import { defineConfig, type UserConfig } from "vite"

const serverRoot = fileURLToPath(new URL(".", import.meta.url))
const contractRoot = fileURLToPath(new URL("../contract", import.meta.url))
const dataRoot = fileURLToPath(new URL("../data", import.meta.url))
const missionCoreRoot = fileURLToPath(new URL("../../mission-core", import.meta.url))

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
