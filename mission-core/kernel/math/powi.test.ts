import fc from "fast-check"
import { describe, expect, test } from "vitest"
import { powi } from "#kernel/math/powi.js"

const BITS = new Float64Array(1)
const VIEW = new DataView(new ArrayBuffer(8))

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

/** xⁿ 的精确值舍入到最近的双精度，平局取偶。x ≥ 0。 */
function exactPowi(x: number, n: number): number {
  if (n === 0) return 1
  const [m, e] = decompose(x)
  const product = m ** BigInt(n)
  const length = product.toString(2).length
  if (length <= 53) return scale(Number(product), e * n)
  const shift = BigInt(length - 53)
  let q = product >> shift
  const rest = product & ((1n << shift) - 1n)
  const half = shift > 0n ? 1n << (shift - 1n) : 0n
  if (rest > half || (rest === half && (q & 1n) === 1n)) q += 1n
  return scale(Number(q), e * n + Number(shift))
}

/** 双倍精度的尾数要低于结果约 106 位仍是正规数，结果再小时尾数会下溢。 */
const DOUBLE_DOUBLE_FLOOR = 1e-290

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

describe("powi", () => {
  test("results are pinned bit for bit", () => {
    const r = lcg(2)
    const values = Array.from({ length: 20000 }, () => powi(r() * 3, Math.floor(r() * 41)))
    expect(fnv(values)).toBe("f80a3234")
  })

  test("is correctly rounded where engines differ", () => {
    expect(powi(1.1, 10)).toBe(2.5937424601000023)
    expect(powi(0.85, 3)).toBe(0.6141249999999999)
  })

  test("is correctly rounded on the stack and bounce grid", () => {
    for (let b = 1; b <= 300; b += 1) {
      for (let n = 0; n <= 24; n += 1) expect(powi(b / 100, n), `${b / 100}^${n}`).toBe(exactPowi(b / 100, n))
    }
  })

  test("is correctly rounded for any base in [0, 3] and exponent up to 40 away from underflow", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 3, noNaN: true }), fc.integer({ min: 0, max: 40 }), (x, n) => {
        const exact = exactPowi(x, n)
        fc.pre(x === 0 || exact >= DOUBLE_DOUBLE_FLOOR)
        expect(powi(x, n)).toBe(exact)
      }),
      { numRuns: 5000 },
    )
  })

  test("special values follow the language specification", () => {
    const cases: readonly (readonly [number, number, number])[] = [
      [2, 0, 1],
      [0, 0, 1],
      [0, 3, 0],
      [-2, 3, -8],
      [2, -2, 0.25],
      [Infinity, 2, Infinity],
      [-Infinity, 3, -Infinity],
      [NaN, 0, 1],
      [0, -1, Infinity],
      [1e200, 2, Infinity],
    ]
    for (const [x, n, want] of cases) expect(Object.is(powi(x, n), want), `powi(${x}, ${n})`).toBe(true)
  })

  test("rejects a non-integer exponent", () => {
    expect(() => powi(2, 0.5)).toThrow(RangeError)
  })
})
