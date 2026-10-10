import fc from "fast-check"
import { describe, expect, test } from "vitest"
import { hypot } from "#kernel/math/hypot.js"

const BITS = new Float64Array(1)
const ORDER = new BigInt64Array(BITS.buffer)
const VIEW = new DataView(new ArrayBuffer(8))

function ulps(a: number, b: number): number {
  BITS[0] = a
  const ia = ORDER[0] ?? 0n
  BITS[0] = b
  return Math.abs(Number(ia - (ORDER[0] ?? 0n)))
}

/** |x| = M·2^E，M 是整数。 */
function decompose(x: number): [bigint, number] {
  VIEW.setFloat64(0, Math.abs(x))
  const high = VIEW.getUint32(0)
  const low = VIEW.getUint32(4)
  const exponent = (high >>> 20) & 0x7ff
  const mantissa = (BigInt(high & 0xfffff) << 32n) | BigInt(low)
  return exponent === 0 ? [mantissa, -1074] : [mantissa | (1n << 52n), exponent - 1075]
}

/** value·2^e，2^e 是精确的 2 的幂。 */
function scale(value: number, exponent: number): number {
  return value * 2 ** exponent
}

/** M·2^e 舍入到最近的双精度，平局取偶；sticky 表示真值略大于 M·2^e。 */
function round(m: bigint, e: number, sticky: boolean): number {
  const length = m.toString(2).length
  if (length <= 53 && !sticky) return scale(Number(m), e)
  const shift = BigInt(Math.max(0, length - 53))
  let q = m >> shift
  const rest = m & ((1n << shift) - 1n)
  const half = shift > 0n ? 1n << (shift - 1n) : 0n
  if (rest > half || (rest === half && (sticky || (q & 1n) === 1n))) q += 1n
  return scale(Number(q), e + Number(shift))
}

function isqrt(n: bigint): bigint {
  if (n < 2n) return n
  let x = 1n << BigInt(Math.ceil(n.toString(2).length / 2))
  for (;;) {
    const y = (x + n / x) >> 1n
    if (y >= x) {
      while (x * x > n) x -= 1n
      while ((x + 1n) * (x + 1n) <= n) x += 1n
      return x
    }
    x = y
  }
}

function exactHypot(x: number, y: number): number {
  if (x === 0 || y === 0) return Math.abs(x === 0 ? y : x)
  const [mx, ex] = decompose(x)
  const [my, ey] = decompose(y)
  const e = Math.min(ex, ey)
  const sum = ((mx * mx) << BigInt(2 * (ex - e))) + ((my * my) << BigInt(2 * (ey - e)))
  const k = Math.max(0, Math.ceil((130 - sum.toString(2).length) / 2))
  const shifted = sum << BigInt(2 * k)
  const q = isqrt(shifted)
  return round(q, e - k, q * q !== shifted)
}

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

/** 最小的正规双精度。次正规的结果不在精度承诺之内。 */
const MIN_NORMAL = 2.2250738585072014e-308
const coordinate = fc.double({ min: -64, max: 64, noNaN: true })

describe("hypot", () => {
  test("results are pinned bit for bit", () => {
    const r = lcg(1)
    const values = Array.from({ length: 20000 }, () => hypot((r() * 2 - 1) * 20, r() < 0.3 ? 0 : (r() * 2 - 1) * 20))
    expect(fnv(values)).toBe("6e3e3a7d")
  })

  test("is the correctly rounded square root where engines differ", () => {
    expect(hypot(3, 2)).toBe(3.605551275463989)
  })

  test("stays within 1 ulp of the exact value", () => {
    const r = lcg(7)
    for (let index = 0; index < 3000; index += 1) {
      const x = (r() * 2 - 1) * 20
      const y = (r() * 2 - 1) * 20
      expect(ulps(hypot(x, y), exactHypot(x, y)), `hypot(${x}, ${y})`).toBeLessThanOrEqual(1)
    }
    const finite = fc.double({ noNaN: true, noDefaultInfinity: true, min: -1e300, max: 1e300 })
    fc.assert(
      fc.property(finite, finite, (x, y) => {
        const exact = exactHypot(x, y)
        fc.pre(exact >= MIN_NORMAL && exact < Number.MAX_VALUE)
        expect(ulps(hypot(x, y), exact)).toBeLessThanOrEqual(1)
      }),
      { numRuns: 5000 },
    )
  })

  test("is symmetric in sign and argument order", () => {
    fc.assert(
      fc.property(coordinate, coordinate, (x, y) => {
        expect(hypot(y, x)).toBe(hypot(x, y))
        expect(hypot(-x, y)).toBe(hypot(x, y))
      }),
    )
  })

  test("rescales outside 2^±500", () => {
    for (const s of [1e300, 1e-300]) expect(ulps(hypot(3 * s, 4 * s), 5 * s)).toBeLessThanOrEqual(1)
  })

  test("special values follow the language specification", () => {
    const cases: readonly (readonly [number, number, number])[] = [
      [Infinity, NaN, Infinity],
      [NaN, -Infinity, Infinity],
      [NaN, 1, NaN],
      [0, 0, 0],
      [-0, -0, 0],
      [0, -2, 2],
      [-3, 0, 3],
    ]
    for (const [x, y, want] of cases) expect(Object.is(hypot(x, y), want), `hypot(${x}, ${y})`).toBe(true)
  })
})
