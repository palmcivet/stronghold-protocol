import { describe, expect, it } from "vitest"
import { assetRefAt, assetRefFromAddress } from "#runtime/media/resource.js"

describe("resource handles", () => {
  it("turns a plain address into a resource handle", () => {
    expect(assetRefFromAddress("/assets/char/avatar/a.png")).toEqual({
      id: "/assets/char/avatar/a.png",
      kind: "image",
      address: "/assets/char/avatar/a.png",
      fallbackId: null,
    })
  })

  it("reads a typed handle from a manifest", () => {
    expect(assetRefAt({ ui: { "skillIcon/empty": "/assets/skill/empty.png" } }, "ui", "skillIcon/empty")).toMatchObject({
      kind: "image",
      address: "/assets/skill/empty.png",
    })
  })
})
