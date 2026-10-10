import { powerOfTwo } from "#kernel/math/float.js"

const P500 = powerOfTwo(500)
const PM500 = powerOfTwo(-500)
const P600 = powerOfTwo(600)
const PM600 = powerOfTwo(-600)

/**
 * √(x² + y²)，只用正确舍入的乘、加与 Math.sqrt，各引擎逐位一致。
 * 量级超出 2^±500 时先乘精确的 2 的幂缩放，避免溢出与下溢。
 */
// TRACE: source/deterministic-math
export function hypot(x: number, y: number): number {
  if (x === Number.POSITIVE_INFINITY || x === Number.NEGATIVE_INFINITY) return Number.POSITIVE_INFINITY
  if (y === Number.POSITIVE_INFINITY || y === Number.NEGATIVE_INFINITY) return Number.POSITIVE_INFINITY
  if (Number.isNaN(x) || Number.isNaN(y)) return Number.NaN
  const m = Math.max(Math.abs(x), Math.abs(y))
  if (m > P500) {
    const a = x * PM600
    const b = y * PM600
    return Math.sqrt(a * a + b * b) * P600
  }
  if (m < PM500 && m !== 0) {
    const a = x * P600
    const b = y * P600
    return Math.sqrt(a * a + b * b) * PM600
  }
  return Math.sqrt(x * x + y * y)
}
