import { describe, expect, it } from "vitest"
import type { AssetKey } from "arknights-assets-catalog"
import type { BattleEvent, UnitSnapshot } from "arknights-mission-core"
import { audioCueFor, effectCueFor } from "./cue.js"

const asset: AssetKey = "audio:sfx/battle/b_hit"

function event(type: string, data: Readonly<Record<string, unknown>> = {}): BattleEvent {
  return { tick: 1, type, data }
}

function unitOf(id: string, kind: UnitSnapshot["kind"]): UnitSnapshot {
  return {
    id,
    side: "ally",
    kind,
    x: 0,
    y: 0,
    facing: "RIGHT",
    height: 0,
    attributes: { hp: 0, maxHp: 1 },
    tags: [],
    attackRange: [],
    deployPositions: [],
    elements: {},
    blocking: [],
    blockedBy: null,
    skills: [],
    shield: 0,
    downed: true,
    redeploy: null,
    components: {},
  }
}

describe("audio cues", () => {
  it("maps battle events to cues and ignores events without a sound", () => {
    expect(audioCueFor(event("damaged", { unitId: "guard", amount: 12 }))).toEqual({
      type: "damage",
      eventType: "damaged",
      unitId: "guard",
    })
    expect(audioCueFor(event("elementHit"))?.type).toBe("element")
    expect(audioCueFor(event("status"))?.type).toBe("status")
    expect(audioCueFor(event("projectile"))?.type).toBe("projectile")
    expect(audioCueFor(event("leak"))?.type).toBe("leak")
    expect(audioCueFor(event("trace"))).toBeNull()
  })

  it("plays a break cue when a stage device goes down and a downed cue for an operator", () => {
    const down = event("downed", { unitId: "crate-1" })

    expect(effectCueFor(down, [unitOf("crate-1", "device")])?.type).toBe("break")
    expect(effectCueFor(down, [unitOf("guard", "operator")])?.type).toBe("downed")
    expect(effectCueFor(down, [])?.type).toBe("downed")
  })

  it("attaches the caller asset key to an audio cue", () => {
    expect(audioCueFor(event("damaged", { unitId: "guard", targetId: "enemy", amount: 12 }), () => asset)).toEqual({
      type: "damage",
      eventType: "damaged",
      unitId: "guard",
      targetId: "enemy",
      asset,
    })
    expect(audioCueFor(event("damaged", { amount: 12 }), () => null)).toEqual({
      type: "damage",
      eventType: "damaged",
    })
  })
})
