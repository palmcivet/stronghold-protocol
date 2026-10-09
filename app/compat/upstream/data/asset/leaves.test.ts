import { describe, expect, it } from "vitest"
import { isSpineRecord, masterLeaves } from "#data/asset/leaves.js"

describe("master leaves", () => {
  const root = {
    plain: "/assets/a.png",
    list: ["/assets/b.png", "/assets/c.png"],
    entries: [{ loop: "/assets/audio/bgm/x.mp3" }],
    spine: { skel: "x.skel", atlas: "x.atlas", textures: ["x.png"] },
    volume: 1.5,
    empty: {},
    none: [],
  }

  it("classifies every value in document order and visits no field of a Spine record", () => {
    const leaves = masterLeaves(root).map((leaf) => [leaf.path.join("."), leaf.type])
    expect(leaves).toEqual([
      ["plain", "text"],
      ["list", "texts"],
      ["entries.0.loop", "text"],
      ["spine", "spine"],
      ["volume", "other"],
      ["none", "texts"],
    ])
  })

  it("names the record that holds each leaf", () => {
    const leaves = masterLeaves(root)
    expect(leaves.find((leaf) => leaf.path.join(".") === "entries.0.loop")?.parent).toBe(root.entries[0])
    expect(leaves.find((leaf) => leaf.path.join(".") === "plain")?.parent).toBe(root)
  })

  it("recognizes a Spine record by its skel field", () => {
    expect(isSpineRecord(root.spine)).toBe(true)
    expect(isSpineRecord(root.entries)).toBe(false)
    expect(isSpineRecord(null)).toBe(false)
  })
})
