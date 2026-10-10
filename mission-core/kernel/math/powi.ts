import { powerOfTwo } from "#kernel/math/float.js"

const P500 = powerOfTwo(500)
/** Dekker 拆分常数 2^27 + 1。 */
const SPLIT = 134217729

interface DoubleDouble {
  head: number
  tail: number
}

/** (a.head + a.tail)·(b.head + b.tail) 的双倍精度乘积写入 out。用 Dekker 拆分求精确乘积，不依赖 FMA。 */
function multiply(a: DoubleDouble, b: DoubleDouble, out: DoubleDouble): void {
  const ah = a.head
  const al = a.tail
  const bh = b.head
  const bl = b.tail
  const p = ah * bh
  let t = SPLIT * ah
  const ahh = t - (t - ah)
  const ahl = ah - ahh
  t = SPLIT * bh
  const bhh = t - (t - bh)
  const bhl = bh - bhh
  const e = ahh * bhh - p + ahh * bhl + ahl * bhh + ahl * bhl + (ah * bl + al * bh)
  const s = p + e
  out.head = s
  out.tail = e - (s - p)
}

/** 普通双精度的平方乘。只用在 |x| > 2^500 或非有限的底数上，这些情况下结果溢出、精确或只舍入一次。 */
function plainPower(x: number, n: number): number {
  let result = 1
  let base = x
  let k = n
  while (k > 0) {
    if (k % 2 === 1) result *= base
    k = Math.floor(k / 2)
    if (k > 0) base *= base
  }
  return result
}

/**
 * xⁿ，n 是整数。平方乘在双倍精度里进行，最后只舍入一次，结果实际上是正确舍入的。
 * n 不是整数时抛出 RangeError。
 */
// TRACE: source/deterministic-math
export function powi(x: number, n: number): number {
  if (!Number.isInteger(n)) throw new RangeError(`powi exponent must be an integer: ${n}`)
  if (n < 0) return 1 / powi(x, -n)
  if (!Number.isFinite(x) || Math.abs(x) > P500) return plainPower(x, n)
  const acc: DoubleDouble = { head: 1, tail: 0 }
  const base: DoubleDouble = { head: x, tail: 0 }
  let k = n
  while (k > 0) {
    if (k % 2 === 1) multiply(acc, base, acc)
    k = Math.floor(k / 2)
    if (k > 0) multiply(base, base, base)
  }
  return acc.head + acc.tail
}
