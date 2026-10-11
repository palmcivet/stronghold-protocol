import { fromWords, highWord, lowWord } from '#kernel/math/float.js';

// MARK: sin / cos

const S1 = -0.16666666666666632;
const S2 = 0.00833333333332249;
const S3 = -1.984126982985795e-4;
const S4 = 2.7557313707070068e-6;
const S5 = -2.5050760253406863e-8;
const S6 = 1.58969099521155e-10;

/** [-π/4, π/4] 上的 sin。y 是 x 的尾数部分；tailed 为 false 时 y 是 0。 */
function kernelSin(x: number, y: number, tailed: boolean): number {
  if ((highWord(x) & 0x7fffffff) < 0x3e400000 && Math.trunc(x) === 0) {
    return x;
  }
  const z = x * x;
  const v = z * x;
  const r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
  if (!tailed) {
    return x + v * (S1 + z * r);
  }
  return x - (z * (0.5 * y - v * r) - y - v * S1);
}

const C1 = 0.0416666666666666;
const C2 = -0.001388888888887411;
const C3 = 2.480158728947673e-5;
const C4 = -2.7557314351390663e-7;
const C5 = 2.087572321298175e-9;
const C6 = -1.1359647557788195e-11;

/** [-π/4, π/4] 上的 cos。y 是 x 的尾数部分。 */
function kernelCos(x: number, y: number): number {
  const ix = highWord(x) & 0x7fffffff;
  if (ix < 0x3e400000 && Math.trunc(x) === 0) {
    return 1;
  }
  const z = x * x;
  const r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
  if (ix < 0x3fd33333) {
    return 1 - (0.5 * z - (z * r - x * y));
  }
  const qx = ix > 0x3fe90000 ? 0.28125 : fromWords(ix - 0x00200000, 0);
  return 1 - qx - (0.5 * z - qx - (z * r - x * y));
}

const NEAR_PI_OVER_2_HIGH = [
  0x3ff921fb, 0x400921fb, 0x4012d97c, 0x401921fb, 0x401f6a7a, 0x4022d97c,
  0x4025fdbb, 0x402921fb, 0x402c463a, 0x402f6a7a, 0x4031475c, 0x4032d97c,
  0x40346b9c, 0x4035fdbb, 0x40378fdb, 0x403921fb, 0x403ab41b, 0x403c463a,
  0x403dd85a, 0x403f6a7a, 0x40407e4c, 0x4041475c, 0x4042106c, 0x4042d97c,
  0x4043a28c, 0x40446b9c, 0x404534ac, 0x4045fdbb, 0x4046c6cb, 0x40478fdb,
  0x404858eb, 0x404921fb,
];
const INV_PIO2 = 0.6366197723675814;
const PIO2_1 = 1.5707963267341256;
const PIO2_1T = 6.077100506506192e-11;
const PIO2_2 = 6.077100506303966e-11;
const PIO2_2T = 2.0222662487959506e-21;
const PIO2_3 = 2.0222662487111665e-21;
const PIO2_3T = 8.4784276603689e-32;
const TWO_PI = 6.283185307179586;

interface Reduced {
  readonly quadrant: number;
  readonly head: number;
  readonly tail: number;
}

/**
 * x − n·π/2 的双倍精度余数与 n。|x| ≤ 2^19·π/2 走 fdlibm 的中等量级路径；
 * 更大的 x 先对最接近 2π 的双精度取精确余数，结果确定但不保证精度。
 */
function reduce(x0: number): Reduced {
  let x = x0;
  if ((highWord(x) & 0x7fffffff) > 0x413921fb) {
    x = x % TWO_PI;
  }
  const hx = highWord(x);
  const ix = hx & 0x7fffffff;
  if (ix <= 0x3fe921fb) {
    return { quadrant: 0, head: x, tail: 0 };
  }
  if (ix < 0x4002d97c) {
    if (hx > 0) {
      let z = x - PIO2_1;
      if (ix !== 0x3ff921fb) {
        const head = z - PIO2_1T;
        return { quadrant: 1, head, tail: z - head - PIO2_1T };
      }
      z -= PIO2_2;
      const head = z - PIO2_2T;
      return { quadrant: 1, head, tail: z - head - PIO2_2T };
    }
    let z = x + PIO2_1;
    if (ix !== 0x3ff921fb) {
      const head = z + PIO2_1T;
      return { quadrant: -1, head, tail: z - head + PIO2_1T };
    }
    z += PIO2_2;
    const head = z + PIO2_2T;
    return { quadrant: -1, head, tail: z - head + PIO2_2T };
  }
  let t = Math.abs(x);
  const n = Math.trunc(t * INV_PIO2 + 0.5);
  let r = t - n * PIO2_1;
  let w = n * PIO2_1T;
  let head = r - w;
  if (!(n < 32 && ix !== NEAR_PI_OVER_2_HIGH[n - 1])) {
    const j = ix >> 20;
    if (j - ((highWord(head) >> 20) & 0x7ff) > 16) {
      t = r;
      w = n * PIO2_2;
      r = t - w;
      w = n * PIO2_2T - (t - r - w);
      head = r - w;
      if (j - ((highWord(head) >> 20) & 0x7ff) > 49) {
        t = r;
        w = n * PIO2_3;
        r = t - w;
        w = n * PIO2_3T - (t - r - w);
        head = r - w;
      }
    }
  }
  const tail = r - head - w;
  if (hx < 0) {
    return { quadrant: -n, head: -head, tail: -tail };
  }
  return { quadrant: n, head, tail };
}

/** 正弦，弧度。fdlibm 5.3 的算法，只用正确舍入的运算，各引擎逐位一致。 */
// TRACE: source/deterministic-math
export function sin(x: number): number {
  if (!Number.isFinite(x)) {
    return Number.NaN;
  }
  if ((highWord(x) & 0x7fffffff) <= 0x3fe921fb) {
    return kernelSin(x, 0, false);
  }
  const { quadrant, head, tail } = reduce(x);
  switch (quadrant & 3) {
    case 0:
      return kernelSin(head, tail, true);
    case 1:
      return kernelCos(head, tail);
    case 2:
      return -kernelSin(head, tail, true);
    default:
      return -kernelCos(head, tail);
  }
}

/** 余弦，弧度。fdlibm 5.3 的算法，只用正确舍入的运算，各引擎逐位一致。 */
// TRACE: source/deterministic-math
export function cos(x: number): number {
  if (!Number.isFinite(x)) {
    return Number.NaN;
  }
  if ((highWord(x) & 0x7fffffff) <= 0x3fe921fb) {
    return kernelCos(x, 0);
  }
  const { quadrant, head, tail } = reduce(x);
  switch (quadrant & 3) {
    case 0:
      return kernelCos(head, tail);
    case 1:
      return -kernelSin(head, tail, true);
    case 2:
      return -kernelCos(head, tail);
    default:
      return kernelSin(head, tail, true);
  }
}

// MARK: atan2

const ATAN_HI = [
  0.4636476090008061, 0.7853981633974483, 0.982793723247329, 1.5707963267948966,
];
const ATAN_LO = [
  2.2698777452961687e-17, 3.061616997868383e-17, 1.3903311031230998e-17,
  6.123233995736766e-17,
];
const AT = [
  0.3333333333333293, -0.19999999999876483, 0.14285714272503466,
  -0.11111110405462356, 0.09090887133436507, -0.0769187620504483,
  0.06661073137387531, -0.058335701337905735, 0.049768779946159324,
  -0.036531572744216916, 0.016285820115365782,
];

function at(index: number): number {
  return AT[index] ?? 0;
}

function atan(x0: number): number {
  let x = x0;
  const hx = highWord(x);
  const ix = hx & 0x7fffffff;
  let id: number;
  if (ix >= 0x44100000) {
    if (ix > 0x7ff00000 || (ix === 0x7ff00000 && lowWord(x) !== 0)) {
      return x + x;
    }
    const big = (ATAN_HI[3] ?? 0) + (ATAN_LO[3] ?? 0);
    return hx > 0 ? big : -(ATAN_HI[3] ?? 0) - (ATAN_LO[3] ?? 0);
  }
  if (ix < 0x3fdc0000) {
    if (ix < 0x3e200000) {
      return x;
    }
    id = -1;
  } else {
    x = Math.abs(x);
    if (ix < 0x3ff30000) {
      if (ix < 0x3fe60000) {
        id = 0;
        x = (2 * x - 1) / (2 + x);
      } else {
        id = 1;
        x = (x - 1) / (x + 1);
      }
    } else if (ix < 0x40038000) {
      id = 2;
      x = (x - 1.5) / (1 + 1.5 * x);
    } else {
      id = 3;
      x = -1 / x;
    }
  }
  const z = x * x;
  const w = z * z;
  const s1 =
    z *
    (at(0) +
      w * (at(2) + w * (at(4) + w * (at(6) + w * (at(8) + w * at(10))))));
  const s2 = w * (at(1) + w * (at(3) + w * (at(5) + w * (at(7) + w * at(9)))));
  if (id < 0) {
    return x - x * (s1 + s2);
  }
  const r = (ATAN_HI[id] ?? 0) - (x * (s1 + s2) - (ATAN_LO[id] ?? 0) - x);
  return hx < 0 ? -r : r;
}

const PI_OVER_4 = 0.7853981633974483;
const PI_OVER_2 = 1.5707963267948966;
const PI = Math.PI;
const PI_LO = 1.2246467991473532e-16;
const INFINITE_X = [0, -0, PI, -PI];
const INFINITE_BOTH = [PI_OVER_4, -PI_OVER_4, 3 * PI_OVER_4, -3 * PI_OVER_4];

/** 点 (x, y) 的辐角，范围 (−π, π]。fdlibm 的算法，只用正确舍入的运算，各引擎逐位一致。 */
// TRACE: source/deterministic-math
export function atan2(y: number, x: number): number {
  if (Number.isNaN(x) || Number.isNaN(y)) {
    return Number.NaN;
  }
  const hx = highWord(x);
  const ix = hx & 0x7fffffff;
  const lx = lowWord(x);
  const hy = highWord(y);
  const iy = hy & 0x7fffffff;
  const ly = lowWord(y);
  if (((hx - 0x3ff00000) | lx) === 0) {
    return atan(y);
  }
  let m = ((hy >>> 31) & 1) | ((hx >>> 30) & 2);
  if ((iy | ly) === 0) {
    return m === 2 ? PI : m === 3 ? -PI : y;
  }
  if ((ix | lx) === 0) {
    return hy < 0 ? -PI_OVER_2 : PI_OVER_2;
  }
  if (ix === 0x7ff00000) {
    if (iy === 0x7ff00000) {
      return INFINITE_BOTH[m] ?? Number.NaN;
    }
    return INFINITE_X[m] ?? Number.NaN;
  }
  if (iy === 0x7ff00000) {
    return hy < 0 ? -PI_OVER_2 : PI_OVER_2;
  }
  const k = (iy - ix) >> 20;
  let z: number;
  if (k > 60) {
    z = PI_OVER_2 + 0.5 * PI_LO;
    m &= 1;
  } else if (hx < 0 && k < -60) {
    z = 0;
  } else {
    z = atan(Math.abs(y / x));
  }
  switch (m) {
    case 0:
      return z;
    case 1:
      return -z;
    case 2:
      return PI - (z - PI_LO);
    default:
      return z - PI_LO - PI;
  }
}
