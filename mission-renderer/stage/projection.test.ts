import { describe, expect, it } from "vitest"
import { calculateBoardTransform } from "./projection.js"

describe("mission projection", () => {
  it("fits the complete map when no camera is provided", () => {
    const transform = calculateBoardTransform(10, 5, null, 64, 640, 480)

    expect(transform).toMatchObject({
      worldX: 0,
      worldY: 0,
      worldWidth: 640,
      worldHeight: 320,
    })
    expect(transform?.scale).toBeCloseTo(0.9)
    expect(transform?.x).toBeCloseTo(32)
    expect(transform?.y).toBeCloseTo(96)
  })

  it("centers a camera rectangle with world-space margin", () => {
    const transform = calculateBoardTransform(
      10,
      5,
      { x: 2, y: 1, width: 4, height: 2, margin: 1 },
      64,
      640,
      480,
    )

    expect(transform).toMatchObject({
      worldX: 128,
      worldY: 128,
      worldWidth: 256,
      worldHeight: 128,
    })
    expect(transform?.scale).toBeCloseTo(5 / 3)
    expect(transform?.x).toBeCloseTo(-320 / 3)
    expect(transform?.y).toBeCloseTo(-80)
  })

  it("rejects an unavailable viewport", () => {
    expect(calculateBoardTransform(4, 4, null, 64, 0, 480)).toBeNull()
  })
})
