import { describe, expect, it } from "vitest"
import { TICK, type BattleEvent, type BattleSnapshot, type UnitSnapshot } from "arknights-mission-core"
import { createLocalFeed } from "./feed.js"

function unit(id: string, x: number): UnitSnapshot {
  return {
    id,
    side: "ally",
    kind: "operator",
    x,
    y: 0,
    attributes: { hp: 1, maxHp: 1 },
    flags: [],
    attackRange: [],
    tags: [],
    deployPositions: [],
    elements: {},
    blocking: [],
    blockedBy: null,
    boomerangsOut: 0,
  }
}

function frame(tick: number, x: number): BattleSnapshot {
  return { tick, units: [unit("guard", x)] }
}

function event(tick: number): BattleEvent {
  return { tick, type: "attack", data: { unitId: "guard" } }
}

describe("local feed", () => {
  it("trails the newest frame by the delay and interpolates units between frames", () => {
    const feed = createLocalFeed({ speed: 1, delay: 0.5 })

    feed.push(frame(0, 0))
    feed.push(frame(100, 100))
    feed.advance(0)
    const sample = feed.sample()
    if (!sample) throw new Error("no sample")

    const time = 100 * TICK - 0.5
    const alpha = time / (100 * TICK)
    expect(sample.time).toBeCloseTo(time, 9)
    expect(sample.units[0]?.x).toBeCloseTo(100 * alpha, 6)
    expect(sample.moving.has("guard")).toBe(true)
  })

  it("holds a unit that is missing from the newer frame until the clock reaches it", () => {
    const feed = createLocalFeed({ speed: 1, delay: 0.5 })

    feed.push({ tick: 0, units: [unit("guard", 2), unit("gone", 5)] })
    feed.push({ tick: 100, units: [unit("guard", 2)] })
    const sample = feed.sample()

    expect(sample?.units.map((item) => item.id)).toContain("gone")
  })

  it("releases an event once the render clock passes its tick", () => {
    const feed = createLocalFeed({ speed: 1, delay: 0.5 })

    feed.push(frame(0, 0))
    feed.push(frame(100, 0))
    feed.advance(0)
    feed.pushEvent(event(1))
    feed.pushEvent(event(100))

    const released = feed.takeEvents()
    expect(released.map((item) => item.tick)).toEqual([1])
    expect(feed.takeEvents()).toEqual([])
  })

  it("advances the render clock at the battle's speed and never past the newest frame", () => {
    const feed = createLocalFeed({ speed: 2, delay: 0 })

    feed.push(frame(0, 0))
    feed.push(frame(10, 10))
    const before = feed.renderTime
    feed.advance(0.1)

    expect(feed.renderTime).toBeGreaterThanOrEqual(before)
    expect(feed.renderTime).toBeLessThanOrEqual(feed.newestTime)
  })

  it("starts over when the stream restarts with an earlier tick", () => {
    const feed = createLocalFeed({ speed: 1, delay: 0 })

    feed.push(frame(200, 20))
    feed.pushEvent(event(200))
    feed.push(frame(5, 1))
    const sample = feed.sample()

    expect(sample?.snapshot.tick).toBe(5)
    expect(feed.takeEvents()).toEqual([])
  })
})
