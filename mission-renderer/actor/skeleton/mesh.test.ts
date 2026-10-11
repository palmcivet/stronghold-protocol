import { describe, expect, it } from "vitest"
import { AdditiveBlending, type BufferAttribute, DynamicDrawUsage, EqualStencilFunc, InvertStencilOp, MeshBasicMaterial, Texture } from "three"
import { createSkeletonMesh, type SkeletonBatchPart } from "#actor/skeleton/mesh.js"

const page = new Texture()

function quad(x: number, patch: Partial<SkeletonBatchPart> = {}): SkeletonBatchPart {
  return {
    page,
    premultipliedAlpha: false,
    blend: "normal",
    positions: [x, 0, x + 1, 0, x + 1, 1, x, 1],
    uvs: [0, 1, 1, 1, 1, 0, 0, 0],
    vertexCount: 4,
    triangles: [0, 1, 2, 2, 3, 0],
    color: [1, 1, 1, 1],
    ...patch,
  }
}

describe("skeleton mesh", () => {
  it("writes parts in order and groups runs that share a page and blend mode", () => {
    const drawn = createSkeletonMesh()
    drawn.begin()
    drawn.append(quad(0))
    drawn.append(quad(1))
    drawn.append(quad(2, { blend: "additive" }))
    drawn.end()
    const geometry = drawn.mesh.geometry
    expect(drawn.vertexCount).toBe(12)
    expect(geometry.drawRange.count).toBe(18)
    expect(geometry.groups.map((group) => [group.start, group.count, group.materialIndex])).toEqual([
      [0, 12, 0],
      [12, 6, 1],
    ])
    expect((drawn.mesh.material as MeshBasicMaterial[])[1]!.blending).toBe(AdditiveBlending)
    expect(Array.from(geometry.getAttribute("uv").array).slice(0, 4)).toEqual([0, 0, 1, 0])
    expect(drawn.bounds()).toEqual({ x: 0, y: 0, width: 3, height: 1 })
  })

  it("premultiplies vertex colours for premultiplied pages", () => {
    const drawn = createSkeletonMesh()
    drawn.begin()
    drawn.append(quad(0, { premultipliedAlpha: true, color: [1, 0.5, 1, 0.5] }))
    drawn.end()
    expect(Array.from(drawn.mesh.geometry.getAttribute("color").array).slice(0, 4)).toEqual([0.5, 0.25, 0.5, 0.5])
  })

  it("clips parts between beginClip and endClip with the stencil, closing an open clipping at the end", () => {
    const drawn = createSkeletonMesh()
    drawn.begin()
    drawn.append(quad(0))
    drawn.beginClip([0, 0, 4, 0, 4, 4, 0, 4], 4)
    expect(drawn.clipping).toBe(true)
    drawn.append(quad(1))
    drawn.endClip()
    drawn.append(quad(2))
    drawn.beginClip([0, 0, 1, 0, 0, 1], 3)
    drawn.append(quad(3))
    drawn.end()
    expect(drawn.clipping).toBe(false)
    const materials = drawn.mesh.material as MeshBasicMaterial[]
    const order = drawn.mesh.geometry.groups.map((group) => group.materialIndex!)
    const stencil = materials.findIndex((material) => !material.colorWrite)
    const clipped = materials.findIndex((material) => material.stencilFunc === EqualStencilFunc)
    expect(order).toEqual([0, stencil, clipped, stencil, 0, stencil, clipped, stencil])
    expect(materials[stencil]!.stencilZPass).toBe(InvertStencilOp)
    expect(drawn.bounds()).toEqual({ x: 0, y: 0, width: 4, height: 1 })
  })

  it("starts each frame empty", () => {
    const drawn = createSkeletonMesh()
    drawn.begin()
    drawn.append(quad(0))
    drawn.end()
    drawn.begin()
    drawn.end()
    expect(drawn.vertexCount).toBe(0)
    expect(drawn.mesh.geometry.drawRange.count).toBe(0)
    expect(drawn.mesh.geometry.groups).toEqual([])
    expect(drawn.bounds()).toEqual({ x: 0, y: 0, width: 0, height: 0 })
  })

  it("reuses its dynamic attributes from frame to frame and uploads only the written part", () => {
    const drawn = createSkeletonMesh()
    drawn.begin()
    drawn.append(quad(0))
    drawn.end()
    const geometry = drawn.mesh.geometry
    const attributes = ["position", "uv", "color"].map((name) => geometry.getAttribute(name) as BufferAttribute)
    const index = geometry.getIndex()!
    const version = attributes[0]!.version
    drawn.begin()
    drawn.append(quad(5))
    drawn.append(quad(6))
    drawn.end()
    expect(["position", "uv", "color"].map((name) => geometry.getAttribute(name))).toEqual(attributes)
    expect(["position", "uv", "color"].every((name, at) => geometry.getAttribute(name) === attributes[at])).toBe(true)
    expect(geometry.getIndex()).toBe(index)
    expect(attributes[0]!.version).toBeGreaterThan(version)
    expect(attributes[0]!.usage).toBe(DynamicDrawUsage)
    expect(attributes[0]!.updateRanges).toEqual([{ start: 0, count: 24 }])
    expect(Array.from(attributes[0]!.array.slice(0, 3))).toEqual([5, 0, 0])
    expect(Array.from(index.array.slice(6, 12))).toEqual([4, 5, 6, 6, 7, 4])
    expect(drawn.bounds()).toEqual({ x: 5, y: 0, width: 2, height: 1 })
  })

  it("replaces an attribute only when the frame outgrows it, keeping earlier vertices", () => {
    const drawn = createSkeletonMesh()
    drawn.begin()
    drawn.append(quad(0))
    drawn.end()
    const before = drawn.mesh.geometry.getAttribute("position")
    drawn.begin()
    for (let x = 0; x < 40; x += 1) drawn.append(quad(x))
    drawn.end()
    const after = drawn.mesh.geometry.getAttribute("position")
    expect(after).not.toBe(before)
    expect(after.array.length).toBeGreaterThanOrEqual(160 * 3)
    expect(drawn.vertexCount).toBe(160)
    expect(Array.from(after.array.slice(39 * 12, 39 * 12 + 3))).toEqual([39, 0, 0])
  })
})
