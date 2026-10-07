import { describe, expect, it, vi } from "vitest"
import { assetRef, createResourceResolver, type AssetRelease } from "arknights-assets-catalog"
import { createRendererResourcePort } from "./resource.js"

const entry = {
  id: "image-a",
  kind: "image" as const,
  address: "/assets/a.png",
  bytes: 1,
  hash: "a".repeat(64),
  dependsOn: [],
  fallbackId: null,
  preloadGroup: "image",
  source: "upstream" as const,
}

const release: AssetRelease = { schemaVersion: 1, entries: { image: entry } }

describe("renderer resource port", () => {
  it("resolves URLs and shares image loads", async () => {
    const resolver = createResourceResolver(release)
    const ref = assetRef(entry)
    const image = vi.fn(async (url: string) => `${url}:loaded`)
    const port = createRendererResourcePort({ resolver, image, spine: async () => "spine" })

    expect(port.url(ref)).toBe("/assets/a.png")
    await expect(port.image(ref)).resolves.toBe("/assets/a.png:loaded")
    await expect(port.image(ref)).resolves.toBe("/assets/a.png:loaded")
    expect(image).toHaveBeenCalledTimes(1)
  })

  it("reference counts spine loads and releases", async () => {
    const resolver = createResourceResolver(release)
    const ref = assetRef(entry)
    const spine = vi.fn(async () => ({ loaded: true }))
    const port = createRendererResourcePort({ resolver, image: async () => "image", spine })

    await port.spine(ref)
    await port.spine(ref)
    expect(spine).toHaveBeenCalledTimes(1)
    port.release(ref)
    await port.spine(ref)
    expect(spine).toHaveBeenCalledTimes(1)
    port.release(ref)
    port.release(ref)
    await port.spine(ref)
    expect(spine).toHaveBeenCalledTimes(2)
  })
})
