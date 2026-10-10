const GROUND_TOKENS = new Set(["WALK", "walk", "ground", "GROUND", "ALL", "all"])
const FLY_TOKENS = new Set(["FLY", "fly"])

/** 地面单位能否走过。WALK、ground、ALL 都算。 */
export function allowsGround(walkableBy: readonly string[]): boolean {
  for (const token of walkableBy) if (GROUND_TOKENS.has(token)) return true
  return false
}

/** 飞行单位能否经过。地面可走的格子飞行也能过。 */
export function allowsFly(walkableBy: readonly string[]): boolean {
  if (allowsGround(walkableBy)) return true
  for (const token of walkableBy) if (FLY_TOKENS.has(token)) return true
  return false
}
