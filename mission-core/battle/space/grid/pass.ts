const groundTokens = new Set(["WALK", "walk", "ground", "GROUND", "ALL", "all"])
const flyTokens = new Set(["FLY", "fly"])

/** 地面单位能否走过。WALK、ground、ALL 都算。 */
export function allowsGround(walkableBy: readonly string[]): boolean {
  for (const token of walkableBy) if (groundTokens.has(token)) return true
  return false
}

/** 飞行单位能否经过。地面可走的格子飞行也能过。 */
export function allowsFly(walkableBy: readonly string[]): boolean {
  if (allowsGround(walkableBy)) return true
  for (const token of walkableBy) if (flyTokens.has(token)) return true
  return false
}
