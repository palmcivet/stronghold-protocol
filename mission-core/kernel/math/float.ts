const F64 = new Float64Array(1)
const I32 = new Int32Array(F64.buffer)
const HIGH = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1 ? 1 : 0
const LOW = 1 - HIGH

/** IEEE 754 双精度的高 32 位，带符号。 */
export function highWord(x: number): number {
  F64[0] = x
  return I32[HIGH] ?? 0
}

/** IEEE 754 双精度的低 32 位，无符号。 */
export function lowWord(x: number): number {
  F64[0] = x
  return (I32[LOW] ?? 0) >>> 0
}

/** 由高低两个 32 位字拼出双精度。 */
export function fromWords(high: number, low: number): number {
  I32[HIGH] = high
  I32[LOW] = low
  return F64[0] ?? 0
}

/** 精确的 2^e，e 在正规数指数范围内。 */
export function powerOfTwo(e: number): number {
  return fromWords((e + 1023) << 20, 0)
}
