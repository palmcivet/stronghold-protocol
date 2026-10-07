import { expect, test } from "vitest"
import type { EffectContext, EffectSpawn } from "#server/content/effect.js"
import { duckReplace } from "#server/content/band/match/duck.js"

test("duck replacement swaps one eligible ground enemy for a listed duck", () => {
  const enemy = { rank: "NORMAL", notCountInTotal: false, stats: { motion: "WALK" } }
  let rolls = 0
  const ctx = {
    gd: { enemy: () => enemy },
    rng: Object.assign(() => 0, {
      chance: () => false,
      pick: <T>(items: readonly T[]) => items[0] as T,
      shuffle: <T>(items: readonly T[]) => items.slice(),
      int: () => {
        rolls += 1
        return 0
      },
    }),
  } as unknown as EffectContext
  const spawns: EffectSpawn[] = [
    { enemyKey: "grunt", count: 2, time: 0, interval: 1 },
    { enemyKey: "flyer", count: 1, time: 3 },
  ]
  const replaced = duckReplace(ctx, spawns, {
    enemylist: "duck_a",
    min: 1,
    max: 1,
    minweight: 0,
    maxweight: 1,
  }, "p1")
  expect(rolls).toBe(1)
  expect(replaced).toHaveLength(1)
  expect(replaced[0]?.tag).toBe("duck")
  expect(replaced[0]?.enemyKey).toBe("duck_a")
  expect(replaced[0]?.bounty).toEqual({ coins: 1, ownerPlayerId: "p1" })
  expect(replaced[0]?.count).toBe(1)
  const ducks = spawns.filter((spawn) => spawn.tag === "duck")
  const grunts = spawns.filter((spawn) => spawn.enemyKey === "grunt")
  expect(ducks).toHaveLength(1)
  expect(grunts).toHaveLength(1)
  expect(grunts[0]?.count).toBe(1)
})
