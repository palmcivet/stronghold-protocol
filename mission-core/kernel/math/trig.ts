import { fromWords, highWord, lowWord } from "#kernel/math/float.js"

// MARK: sin / cos

const S1 = -1.66666666666666324348e-1
const S2 = 8.33333333332248946124e-3
const S3 = -1.98412698298579493134e-4
const S4 = 2.75573137070700676789e-6
const S5 = -2.50507602534068634195e-8
const S6 = 1.58969099521155010221e-10

/** [-π/4, π/4] 上的 sin。y 是 x 的尾数部分；tailed 为 false 时 y 是 0。 */
function kernelSin(x: number, y: number, tailed: boolean): number {
  if ((highWord(x) & 0x7fffffff) < 0x3e400000 && Math.trunc(x) === 0) return x
  const z = x * x
  const v = z * x
  const r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)))
  if (!tailed) return x + v * (S1 + z * r)
  return x - (z * (0.5 * y - v * r) - y - v * S1)
}

const C1 = 4.16666666666666019037e-2
const C2 = -1.38888888888741095749e-3
const C3 = 2.48015872894767294178e-5
const C4 = -2.75573143513906633035e-7
const C5 = 2.0875723212981748279e-9
const C6 = -1.13596475577881948265e-11

/** [-π/4, π/4] 上的 cos。y 是 x 的尾数部分。 */
function kernelCos(x: number, y: number): number {
  const ix = highWord(x) & 0x7fffffff
  if (ix < 0x3e400000 && Math.trunc(x) === 0) return 1
  const z = x * x
  const r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))))
  if (ix < 0x3fd33333) return 1 - (0.5 * z - (z * r - x * y))
  const qx = ix > 0x3fe90000 ? 0.28125 : fromWords(ix - 0x00200000, 0)
  return 1 - qx - (0.5 * z - qx - (z * r - x * y))
}

const NEAR_PI_OVER_2_HIGH = [
  0x3ff921fb, 0x400921fb, 0x4012d97c, 0x401921fb, 0x401f6a7a, 0x4022d97c, 0x4025fdbb, 0x402921fb, 0x402c463a, 0x402f6a7a,
  0x4031475c, 0x4032d97c, 0x40346b9c, 0x4035fdbb, 0x40378fdb, 0x403921fb, 0x403ab41b, 0x403c463a, 0x403dd85a, 0x403f6a7a,
  0x40407e4c, 0x4041475c, 0x4042106c, 0x4042d97c, 0x4043a28c, 0x40446b9c, 0x404534ac, 0x4045fdbb, 0x4046c6cb, 0x40478fdb,
  0x404858eb, 0x404921fb,
]
const INV_PIO2 = 6.36619772367581382433e-1
const PIO2_1 = 1.57079632673412561417
const PIO2_1T = 6.07710050650619224932e-11
const PIO2_2 = 6.0771005063039659766e-11
const PIO2_2T = 2.02226624879595063154e-21
const PIO2_3 = 2.0222662487111664558e-21
const PIO2_3T = 8.47842766036889956997e-32
const TWO_PI = 6.283185307179586

interface Reduced {
  readonly quadrant: number
  readonly head: number
  readonly tail: number
}

/**
 * x − n·π/2 的双倍精度余数与 n。|x| ≤ 2^19·π/2 走 fdlibm 的中等量级路径；
 * 更大的 x 先对最接近 2π 的双精度取精确余数，结果确定但不保证精度。
 */
function reduce(x0: number): Reduced {
  let x = x0
  if ((highWord(x) & 0x7fffffff) > 0x413921fb) x = x % TWO_PI
  const hx = highWord(x)
  const ix = hx & 0x7fffffff
  if (ix <= 0x3fe921fb) return { quadrant: 0, head: x, tail: 0 }
  if (ix < 0x4002d97c) {
    if (hx > 0) {
      let z = x - PIO2_1
      if (ix !== 0x3ff921fb) {
        const head = z - PIO2_1T
        return { quadrant: 1, head, tail: z - head - PIO2_1T }
      }
      z -= PIO2_2
      const head = z - PIO2_2T
      return { quadrant: 1, head, tail: z - head - PIO2_2T }
    }
    let z = x + PIO2_1
    if (ix !== 0x3ff921fb) {
      const head = z + PIO2_1T
      return { quadrant: -1, head, tail: z - head + PIO2_1T }
    }
    z += PIO2_2
    const head = z + PIO2_2T
    return { quadrant: -1, head, tail: z - head + PIO2_2T }
  }
  let t = Math.abs(x)
  const n = Math.trunc(t * INV_PIO2 + 0.5)
  let r = t - n * PIO2_1
  let w = n * PIO2_1T
  let head = r - w
  if (!(n < 32 && ix !== NEAR_PI_OVER_2_HIGH[n - 1])) {
    const j = ix >> 20
    if (j - ((highWord(head) >> 20) & 0x7ff) > 16) {
      t = r
      w = n * PIO2_2
      r = t - w
      w = n * PIO2_2T - (t - r - w)
      head = r - w
      if (j - ((highWord(head) >> 20) & 0x7ff) > 49) {
        t = r
        w = n * PIO2_3
        r = t - w
        w = n * PIO2_3T - (t - r - w)
        head = r - w
      }
    }
  }
  const tail = r - head - w
  if (hx < 0) return { quadrant: -n, head: -head, tail: -tail }
  return { quadrant: n, head, tail }
}

/** 正弦，弧度。fdlibm 5.3 的算法，只用正确舍入的运算，各引擎逐位一致。 */
// TRACE: source/deterministic-math
export function sin(x: number): number {
  if (!Number.isFinite(x)) return Number.NaN
  if ((highWord(x) & 0x7fffffff) <= 0x3fe921fb) return kernelSin(x, 0, false)
  const { quadrant, head, tail } = reduce(x)
  switch (quadrant & 3) {
    case 0:
      return kernelSin(head, tail, true)
    case 1:
      return kernelCos(head, tail)
    case 2:
      return -kernelSin(head, tail, true)
    default:
      return -kernelCos(head, tail)
  }
}

/** 余弦，弧度。fdlibm 5.3 的算法，只用正确舍入的运算，各引擎逐位一致。 */
// TRACE: source/deterministic-math
export function cos(x: number): number {
  if (!Number.isFinite(x)) return Number.NaN
  if ((highWord(x) & 0x7fffffff) <= 0x3fe921fb) return kernelCos(x, 0)
  const { quadrant, head, tail } = reduce(x)
  switch (quadrant & 3) {
    case 0:
      return kernelCos(head, tail)
    case 1:
      return -kernelSin(head, tail, true)
    case 2:
      return -kernelCos(head, tail)
    default:
      return kernelSin(head, tail, true)
  }
}

// MARK: atan2

const ATAN_HI = [4.63647609000806093515e-1, 7.85398163397448278999e-1, 9.82793723247329054082e-1, 1.570796326794896558]
const ATAN_LO = [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17]
const AT = [
  3.33333333333329318027e-1, -1.99999999998764832476e-1, 1.42857142725034663711e-1, -1.1111110405462355788e-1,
  9.09088713343650656196e-2, -7.69187620504482999495e-2, 6.66107313738753120669e-2, -5.83357013379057348645e-2,
  4.97687799461593236017e-2, -3.6531572744216915527e-2, 1.62858201153657823623e-2,
]

function at(index: number): number {
  return AT[index] ?? 0
}

function atan(x0: number): number {
  let x = x0
  const hx = highWord(x)
  const ix = hx & 0x7fffffff
  let id: number
  if (ix >= 0x44100000) {
    if (ix > 0x7ff00000 || (ix === 0x7ff00000 && lowWord(x) !== 0)) return x + x
    const big = (ATAN_HI[3] ?? 0) + (ATAN_LO[3] ?? 0)
    return hx > 0 ? big : -(ATAN_HI[3] ?? 0) - (ATAN_LO[3] ?? 0)
  }
  if (ix < 0x3fdc0000) {
    if (ix < 0x3e200000) return x
    id = -1
  } else {
    x = Math.abs(x)
    if (ix < 0x3ff30000) {
      if (ix < 0x3fe60000) {
        id = 0
        x = (2 * x - 1) / (2 + x)
      } else {
        id = 1
        x = (x - 1) / (x + 1)
      }
    } else if (ix < 0x40038000) {
      id = 2
      x = (x - 1.5) / (1 + 1.5 * x)
    } else {
      id = 3
      x = -1 / x
    }
  }
  const z = x * x
  const w = z * z
  const s1 = z * (at(0) + w * (at(2) + w * (at(4) + w * (at(6) + w * (at(8) + w * at(10))))))
  const s2 = w * (at(1) + w * (at(3) + w * (at(5) + w * (at(7) + w * at(9)))))
  if (id < 0) return x - x * (s1 + s2)
  const r = (ATAN_HI[id] ?? 0) - (x * (s1 + s2) - (ATAN_LO[id] ?? 0) - x)
  return hx < 0 ? -r : r
}

const PI_OVER_4 = 7.85398163397448279e-1
const PI_OVER_2 = 1.570796326794896558
const PI = 3.141592653589793116
const PI_LO = 1.2246467991473532e-16
const INFINITE_X = [0, -0, PI, -PI]
const INFINITE_BOTH = [PI_OVER_4, -PI_OVER_4, 3 * PI_OVER_4, -3 * PI_OVER_4]

/** 点 (x, y) 的辐角，范围 (−π, π]。fdlibm 的算法，只用正确舍入的运算，各引擎逐位一致。 */
// TRACE: source/deterministic-math
export function atan2(y: number, x: number): number {
  if (Number.isNaN(x) || Number.isNaN(y)) return Number.NaN
  const hx = highWord(x)
  const ix = hx & 0x7fffffff
  const lx = lowWord(x)
  const hy = highWord(y)
  const iy = hy & 0x7fffffff
  const ly = lowWord(y)
  if (((hx - 0x3ff00000) | lx) === 0) return atan(y)
  let m = ((hy >>> 31) & 1) | ((hx >>> 30) & 2)
  if ((iy | ly) === 0) return m === 2 ? PI : m === 3 ? -PI : y
  if ((ix | lx) === 0) return hy < 0 ? -PI_OVER_2 : PI_OVER_2
  if (ix === 0x7ff00000) {
    if (iy === 0x7ff00000) return INFINITE_BOTH[m] ?? Number.NaN
    return INFINITE_X[m] ?? Number.NaN
  }
  if (iy === 0x7ff00000) return hy < 0 ? -PI_OVER_2 : PI_OVER_2
  const k = (iy - ix) >> 20
  let z: number
  if (k > 60) {
    z = PI_OVER_2 + 0.5 * PI_LO
    m &= 1
  } else if (hx < 0 && k < -60) z = 0
  else z = atan(Math.abs(y / x))
  switch (m) {
    case 0:
      return z
    case 1:
      return -z
    case 2:
      return PI - (z - PI_LO)
    default:
      return z - PI_LO - PI
  }
}
