import { describe, expect, it } from "vitest"
import { fileFormatOf, hrefOf, packFileOf, spineFiles } from "#data/asset/files.js"

const ROOT = "https://master.example/"

describe("upstream files", () => {
  it("resolves an audio address through the extension-less media route", () => {
    expect(hrefOf(ROOT, "/assets/audio/bgm/m_bat_x_loop.mp3")).toBe("https://master.example/media/bgm/m_bat_x_loop")
    expect(hrefOf(ROOT, "/assets/audio/sfx/battle/b_char/b_char_set.mp3")).toBe("https://master.example/media/sfx/battle/b_char/b_char_set")
  })

  it("resolves other addresses under the backend root", () => {
    expect(hrefOf(ROOT, "/assets/char/avatar/char_003_kalts.png")).toBe("https://master.example/assets/char/avatar/char_003_kalts.png")
    expect(hrefOf(ROOT, "/fonts/bender-regular.woff2")).toBe("https://master.example/fonts/bender-regular.woff2")
    expect(hrefOf("https://host.example/master/", "/assets/band/band_x.png")).toBe("https://host.example/master/assets/band/band_x.png")
  })

  it("builds a catalog file with no size and no hash, which the href replaces", () => {
    expect(packFileOf(ROOT, { role: "main", name: null, format: "png", address: "/assets/bond/yanShip.png" })).toEqual({
      role: "main",
      name: null,
      format: "png",
      bytes: 0,
      hash: "",
      href: "https://master.example/assets/bond/yanShip.png",
    })
  })

  it("reads the format from the extension of a known file", () => {
    expect(fileFormatOf("/assets/x.png")).toBe("png")
    expect(fileFormatOf("/assets/x.unknown")).toBeNull()
    expect(fileFormatOf("/assets/x")).toBeNull()
  })

  it("names the Spine files after their base names, one page per texture", () => {
    const result = spineFiles({
      skel: "/assets/spine/enemy/enemy_1/enemy_1.skel",
      atlas: "/assets/spine/enemy/enemy_1/enemy_1.atlas",
      textures: ["/assets/spine/enemy/enemy_1/enemy_1.png", "/assets/spine/enemy/enemy_1/enemy_1_2.png"],
    })
    expect(result).toEqual({
      files: [
        { role: "skel", name: "enemy_1.skel", format: "skel", address: "/assets/spine/enemy/enemy_1/enemy_1.skel" },
        { role: "atlas", name: "enemy_1.atlas", format: "atlas", address: "/assets/spine/enemy/enemy_1/enemy_1.atlas" },
        { role: "page", name: "enemy_1.png", format: "png", address: "/assets/spine/enemy/enemy_1/enemy_1.png" },
        { role: "page", name: "enemy_1_2.png", format: "png", address: "/assets/spine/enemy/enemy_1/enemy_1_2.png" },
      ],
    })
  })

  it("reports a Spine record without a texture, with the wrong skeleton or page format", () => {
    expect(spineFiles({ skel: "/a.skel", atlas: "/a.atlas", textures: [] })).toEqual({ reason: "a Spine record needs skel, atlas and a non-empty textures list" })
    expect(spineFiles({ skel: "/a.json", atlas: "/a.atlas", textures: ["/a.png"] })).toEqual({ reason: "a Spine skeleton must be a .skel file, got /a.json" })
    expect(spineFiles({ skel: "/a.skel", atlas: "/a.atlas", textures: ["/a.jpg"] })).toEqual({ reason: "a Spine page must be a png or webp address, got /a.jpg" })
  })
})
