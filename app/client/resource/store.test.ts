import { describe, expect, it } from "vitest"
import { loadResourceStore } from "./store.js"

describe("client resource store", () => {
  it("loads the base catalog and resolves season addresses", async () => {
    const responses: Record<string, unknown> = {
      "https://cdn.example/base/base.json": { catalog: "assets/catalog.json" },
      "https://cdn.example/base/assets/catalog.json": {
        schemaVersion: 1,
        entries: {
          image: {
            id: "image",
            kind: "image",
            address: "/assets/a.png",
            bytes: 1,
            hash: "a".repeat(64),
            dependsOn: [],
            fallbackId: null,
            preloadGroup: "image",
            source: "upstream",
          },
        },
      },
      "https://cdn.example/season/season.json": { seasonId: "act2autochess", resourceManifest: "resources.json" },
      "https://cdn.example/season/resources.json": { ui: { icon: { id: "image", kind: "image", address: "/assets/a.png", fallbackId: null } } },
    }
    const fetch = async (input: RequestInfo | URL) => ({
      ok: true,
      status: 200,
      json: async () => responses[String(input)],
    }) as Response

    const store = await loadResourceStore({
      baseManifest: "https://cdn.example/base/base.json",
      seasonManifest: "https://cdn.example/season/season.json",
      fetch,
    })
    const ref = store.ref("/assets/a.png")
    expect(ref?.id).toBe("image")
    expect(store.resource("ui", "icon")?.id).toBe("image")
    expect(store.url(ref!)).toBe("https://cdn.example/assets/a.png")
  })

  it("retries transient manifest failures", async () => {
    let attempts = 0
    const fetch = async (input: RequestInfo | URL) => {
      attempts += 1
      if (attempts === 1) return { ok: false, status: 503 } as Response
      const url = String(input)
      const body = url.endsWith("base.json")
        ? { catalog: "assets/catalog.json" }
        : url.endsWith("catalog.json")
          ? { schemaVersion: 1, entries: {} }
          : url.endsWith("season.json")
            ? { resourceManifest: "resources.json" }
            : {}
      return { ok: true, status: 200, json: async () => body } as Response
    }
    await loadResourceStore({
      baseManifest: "https://cdn.example/base.json",
      seasonManifest: "https://cdn.example/season.json",
      retryDelays: [0],
      fetch,
    })
    expect(attempts).toBeGreaterThan(3)
  })
})
