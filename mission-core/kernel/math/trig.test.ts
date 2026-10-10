import fc from "fast-check"
import { describe, expect, test } from "vitest"
import { atan2, cos, sin } from "#kernel/math/trig.js"

const BITS = new Float64Array(1)

function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

function fnv(values: readonly number[]): string {
  const words = new Uint32Array(BITS.buffer)
  let h = 0x811c9dc5
  for (const value of values) {
    BITS[0] = value
    for (const word of words) {
      for (let k = 0; k < 4; k += 1) {
        h ^= (word >>> (8 * k)) & 0xff
        h = Math.imul(h, 16777619)
      }
    }
  }
  return (h >>> 0).toString(16).padStart(8, "0")
}

const angle = fc.double({ min: -1e6, max: 1e6, noNaN: true })
const coordinate = fc.double({ min: -64, max: 64, noNaN: true })

describe("sin and cos", () => {
  test("results are pinned bit for bit", () => {
    const rs = lcg(3)
    const rc = lcg(4)
    expect(fnv(Array.from({ length: 20000 }, () => sin((rs() * 2 - 1) * 4 * Math.PI)))).toBe("73aedcb1")
    expect(fnv(Array.from({ length: 20000 }, () => cos((rc() * 2 - 1) * 4 * Math.PI)))).toBe("51b52432")
  })

  test("give the fdlibm results where engines differ", () => {
    expect(sin(2.22566898269194)).toBe(0.7931254945086104)
    expect(cos(0.74090688893123)).toBe(0.7378567508940902)
  })

  test("keep their symmetries", () => {
    fc.assert(
      fc.property(angle, (x) => {
        expect(Object.is(sin(-x), -sin(x))).toBe(true)
        expect(Object.is(cos(-x), cos(x))).toBe(true)
      }),
    )
  })

  test("stay on the unit circle", () => {
    fc.assert(
      fc.property(angle, (x) => {
        expect(Math.abs(sin(x) * sin(x) + cos(x) * cos(x) - 1)).toBeLessThan(1e-15)
      }),
    )
  })

  test("special values follow the language specification", () => {
    for (const x of [0, -0]) {
      expect(Object.is(sin(x), x)).toBe(true)
      expect(cos(x)).toBe(1)
    }
    for (const x of [Infinity, -Infinity, NaN]) {
      expect(sin(x)).toBeNaN()
      expect(cos(x)).toBeNaN()
    }
  })
})

describe("atan2", () => {
  test("results are pinned bit for bit", () => {
    const r = lcg(5)
    expect(fnv(Array.from({ length: 20000 }, () => atan2((r() * 2 - 1) * 20, (r() * 2 - 1) * 20)))).toBe("a0ab93f0")
  })

  test("gives the fdlibm result where engines differ", () => {
    expect(atan2(0.5098986645868919, 0.74162210852462)).toBe(0.6023179867387403)
  })

  test("is odd in y and inverts sin and cos", () => {
    fc.assert(
      fc.property(coordinate, coordinate, (y, x) => {
        expect(Object.is(atan2(-y, x), -atan2(y, x))).toBe(true)
      }),
    )
    fc.assert(
      fc.property(fc.double({ min: -3, max: 3, noNaN: true }), (a) => {
        expect(Math.abs(atan2(sin(a), cos(a)) - a)).toBeLessThan(1e-15)
      }),
    )
  })

  test("special values follow the language specification", () => {
    const P = Math.PI
    const H = Math.PI / 2
    const Q = Math.PI / 4
    const cases: readonly (readonly [number, number, number])[] = [
      [0, 1, 0], [-0, 1, -0], [0, -1, P], [-0, -1, -P], [0, 0, 0], [-0, 0, -0], [0, -0, P], [-0, -0, -P],
      [1, 0, H], [-1, 0, -H], [1, -0, H], [-1, -0, -H],
      [1, Infinity, 0], [-1, Infinity, -0], [1, -Infinity, P], [-1, -Infinity, -P],
      [Infinity, 1, H], [-Infinity, 1, -H], [Infinity, Infinity, Q], [-Infinity, Infinity, -Q],
      [Infinity, -Infinity, 3 * Q], [-Infinity, -Infinity, -3 * Q],
      [NaN, 1, NaN], [1, NaN, NaN], [1, 1, Q], [-1, -1, -3 * Q],
    ]
    for (const [y, x, want] of cases) expect(Object.is(atan2(y, x), want), `atan2(${y}, ${x})`).toBe(true)
  })
})
