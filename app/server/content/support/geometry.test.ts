import { expect, test } from "vitest"
import type { EffectContext, EffectPiece } from "#server/content/effect.js"
import { frontOf } from "#server/content/support/geometry.js"
import { frontPiece, behindPiece } from "#server/content/support/meta.js"

test("front tile follows the facing", () => {
  expect(frontOf(10, 5, "UP", 1)).toEqual([11, 5])
  expect(frontOf(10, 5, "RIGHT", 1)).toEqual([10, 6])
  expect(frontOf(10, 5, "LEFT", 1)).toEqual([10, 4])
  expect(frontOf(10, 5, "DOWN", 2)).toEqual([8, 5])
})

test("front and behind pieces use the board piece facing", () => {
  const pieces: EffectPiece[] = [
    { id: "self", kind: "chess", row: 10, col: 5, dir: "UP" },
    { id: "above", kind: "chess", row: 11, col: 5 },
    { id: "below", kind: "chess", row: 9, col: 5 },
    { id: "right", kind: "chess", row: 10, col: 6 },
  ]
  const ctx = { board: () => pieces } as unknown as EffectContext
  const self = pieces[0]
  expect(frontPiece(ctx, self)?.id).toBe("above")
  expect(behindPiece(ctx, self)?.id).toBe("below")
  expect(frontPiece(ctx, { id: "east", kind: "chess", row: 10, col: 5, dir: "RIGHT" })?.id).toBe("right")
})
