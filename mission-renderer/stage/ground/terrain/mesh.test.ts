import { describe, expect, it } from "vitest"
import type { TerrainGeometry } from "./layout.js"
import { boxGeometry, parseObj, placeBoardMesh } from "./mesh.js"

const TRIANGLE = `
v 0 1 0
v 0 0 1
v 1 0 0
vn 0 1 0
vn 0 0 1
vn 1 0 0
f 1//1 2//2 3//3
`

function point(x: number, y: number, z: number): TerrainGeometry {
  return {
    position: Float32Array.from([x, y, z]),
    normal: Float32Array.from([0, 0, 1]),
    uv: Float32Array.from([0, 0]),
    color: Float32Array.from([1, 1, 1]),
    index: Uint16Array.from([]),
  }
}

describe("terrain mesh", () => {
  it("reads a triangle with its corner indices", () => {
    const mesh = parseObj(TRIANGLE)
    if (!mesh) throw new Error("mesh did not parse")

    expect(mesh.index).toEqual(new Uint16Array([0, 1, 2]))
    expect(mesh.normal).not.toBeNull()
  })

  it("places a board point and converts it to the scene's axes", () => {
    const placed = placeBoardMesh(point(0, 0, 0), { x: 10, y: 20, z: 5 })

    expect(Array.from(placed.position)).toEqual([10, 5, -20])
  })

  it("turns a placed point a quarter turn about the board's up axis", () => {
    const placed = placeBoardMesh(point(1, 0, 0), { x: 0, y: 0, z: 0, quarterTurns: 1 })

    expect(Array.from(placed.position).map((value) => Math.round(value * 1e6) / 1e6)).toEqual([0, 0, -1])
  })

  it("builds a five-face box with one index run per face", () => {
    const box = boxGeometry(1, 2)

    expect(box.position.length / 3).toBe(20)
    expect(box.index.length).toBe(30)
    expect(box.uv.length).toBe(40)
  })
})
