import { describe, expect, it } from "vitest"
import { createResourceResolver } from "#runtime/media/resource.js"
import type { AssetRelease } from "#schema/asset-ref.js"

describe("resource resolver", () => {
  it("resolves an AssetRef fallback", () => {
    const release: AssetRelease = {
      schemaVersion: 1,
      entries: {
        fallback: {
          id: "fallback",
          kind: "image",
          address: "/assets/fallback.png",
          bytes: 1,
          hash: "a".repeat(64),
          dependsOn: [],
          fallbackId: null,
          preloadGroup: "image",
          source: "upstream",
        },
      },
    }
    const resolver = createResourceResolver(release)
    expect(resolver.url({
      id: "missing",
      kind: "image",
      address: "/assets/missing.png",
      fallbackId: "fallback",
    })).toBe("/assets/fallback.png")
  })
})
