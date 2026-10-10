import { describe, expect, test } from "vitest"
import { SCENARIOS } from "#test/golden/scenario.js"
import { canonical, eventCounts, replay } from "#test/replay.js"

/** 每个场景必须实际触发的事件，保证黄金回放覆盖到这条机制。 */
const EXERCISED: Readonly<Record<string, readonly string[]>> = {
  "attack-shape": ["hit", "damaged", "heal"],
  projectile: ["projectile", "damaged"],
  status: ["status", "damaged"],
  element: ["elementHit", "elementBurst"],
  motion: ["displace", "status"],
  block: ["blocked", "damaged"],
  skill: ["skill-start", "skill-end", "ammo-used"],
  redeploy: ["downed", "deploy", "cost"],
  cost: ["cost"],
  leak: ["spawn", "leak"],
}

describe("golden replay", () => {
  test("every scenario matches the recorded digests", async () => {
    const replays = Object.fromEntries(SCENARIOS.map((scenario) => [scenario.name, replay(scenario)]))
    await expect(`${JSON.stringify(replays, null, 2)}\n`).toMatchFileSnapshot("./baseline.json")
  })

  for (const scenario of SCENARIOS) {
    test(`${scenario.name} exercises its mechanism`, () => {
      const counts = eventCounts(scenario)
      for (const type of EXERCISED[scenario.name] ?? []) expect(counts[type] ?? 0, type).toBeGreaterThan(0)
    })

    test(`${scenario.name} replays identically`, () => {
      expect(canonical(replay(scenario))).toBe(canonical(replay(scenario)))
    })
  }
})

describe("canonical", () => {
  test("sorts keys and keeps the sign of zero and non-finite numbers", () => {
    expect(canonical({ b: -0, a: [Infinity, NaN, 0.1] })).toBe('{"a":[Infinity,NaN,0.1],"b":-0}')
  })
})
