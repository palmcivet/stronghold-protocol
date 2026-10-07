import { describe, expect, it } from "vitest"
import { buildCatalogRelease } from "#compiler/release-index.js"
import type { CatalogFiles } from "#port/catalog-files.js"

function files(values: Record<string, string>): CatalogFiles {
  return {
    readText: async (path) => values[path] ?? "",
    readBytes: async (path) => new TextEncoder().encode(values[path] ?? ""),
    writeTextAtomic: async () => {},
    exists: async (path) => path in values,
    readDir: async () => [],
  }
}

describe("catalog release index", () => {
  it("records content identity, kind, address and source", async () => {
    const release = await buildCatalogRelease({
      files: files({
        "char/avatar/a.png": "image",
        "audio/bgm/a.mp3": "sound",
        "map/a.json": "{}",
      }),
      paths: ["audio/bgm/a.mp3", "char/avatar/a.png", "map/a.json"],
    })

    expect(release.schemaVersion).toBe(1)
    expect(release.contentVersion).toMatch(/^[0-9a-f]{16}$/)
    expect(release.entries["char/avatar/a.png"]).toMatchObject({
      kind: "image",
      address: "/assets/char/avatar/a.png",
      preloadGroup: "image",
      bytes: 5,
    })
    expect(release.entries["audio/bgm/a.mp3"]).toMatchObject({ kind: "audio", preloadGroup: "audio" })
    expect(release.entries["map/a.json"]).toMatchObject({ kind: "model" })
  })
})
