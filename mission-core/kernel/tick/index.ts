/** 固定步长，1/30 游戏秒。 */
export const TICK: number = 1 / 30

/**
 * 拍对齐的容差，单位与比较的量相同。
 * 远大于按拍累加的浮点残差，远小于一拍，整拍数的时长因此正好走那么多拍。
 */
export const READY_EPSILON = 1e-9

/** 倒计时走过 dt 之后的剩余。剩余在 READY_EPSILON 以内记为 0。 */
export function countdown(remaining: number, dt: number): number {
  const left = remaining - dt
  return left > READY_EPSILON ? left : 0
}

/** 累计量是否已经到达目标。差距在 READY_EPSILON 以内算作到达。 */
export function reached(value: number, target: number): boolean {
  return value + READY_EPSILON >= target
}
