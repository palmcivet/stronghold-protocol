export interface Random {
  (): number
  int(n: number): number
  range(a: number, b: number): number
  chance(p: number): boolean
  pick<T>(items: readonly T[]): T | undefined
  shuffle<T>(items: T[]): T[]
  weighted<T>(items: readonly T[], weight: (item: T) => number): T | undefined
  state(): number
  /** 回到 state() 返回过的状态。 */
  restore(state: number): void
}

/** mulberry32。种子 0 换成固定非零值，避免状态停在 0。 */
export function createRandom(seed: number = 1): Random {
  let state = (Number(seed) >>> 0) || 0x9e3779b9
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = state
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
  const random = ((): number => next()) as Random
  random.int = (n: number): number => Math.floor(next() * Math.max(0, n))
  random.range = (a: number, b: number): number => a + next() * (b - a)
  random.chance = (p: number): boolean => next() < p
  random.pick = <T>(items: readonly T[]): T | undefined => {
    if (items.length === 0) return undefined
    return items[Math.floor(next() * items.length)]
  }
  random.shuffle = <T>(items: T[]): T[] => {
    for (let index = items.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(next() * (index + 1))
      const current = items[index]
      const other = items[swap]
      if (current === undefined || other === undefined) continue
      items[index] = other
      items[swap] = current
    }
    return items
  }
  random.weighted = <T>(items: readonly T[], weight: (item: T) => number): T | undefined => {
    let total = 0
    for (const item of items) total += Math.max(0, weight(item))
    if (total <= 0) return undefined
    let roll = next() * total
    for (const item of items) {
      roll -= Math.max(0, weight(item))
      if (roll < 0) return item
    }
    return items[items.length - 1]
  }
  random.state = (): number => state
  random.restore = (next: number): void => {
    state = next >>> 0
  }
  return random
}

/** 由种子和盐算出另一个 uint32 种子。 */
export function deriveSeed(seed: number, salt: string): number {
  let hash = (Number(seed) >>> 0) ^ 0x85ebca6b
  for (let index = 0; index < salt.length; index += 1) {
    hash = Math.imul(hash ^ salt.charCodeAt(index), 0x9e3779b1)
    hash ^= hash >>> 13
  }
  return hash >>> 0
}
