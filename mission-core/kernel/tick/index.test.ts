import fc from "fast-check"
import { describe, expect, test } from "vitest"
import { countdown, reached, READY_EPSILON, TICK } from "#kernel/tick/index.js"

function ticksUntilZero(seconds: number): number {
  let remaining = seconds
  let ticks = 0
  while (remaining > 0) {
    remaining = countdown(remaining, TICK)
    ticks += 1
  }
  return ticks
}

function ticksUntilReached(target: number, gain: number): number {
  let value = 0
  let ticks = 0
  while (!reached(value, target)) {
    value += gain
    ticks += 1
  }
  return ticks
}

describe("countdown", () => {
  test("a whole number of frames takes exactly that many ticks", () => {
    expect(ticksUntilZero(1)).toBe(30)
    expect(ticksUntilZero(3)).toBe(90)
    expect(ticksUntilZero(0.4)).toBe(12)
    expect(ticksUntilZero(0.5)).toBe(15)
  })

  test("any whole number of frames up to a minute takes exactly that many ticks", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1800 }), (frames) => {
        expect(ticksUntilZero(frames / 30)).toBe(frames)
      }),
    )
  })

  test("an interval scaled by attack speed ends on the tick that crosses zero", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 300 }), fc.integer({ min: 20, max: 600 }), (frames, speed) => {
        const interval = frames / 30 / (speed / 100)
        expect(ticksUntilZero(interval)).toBe(Math.ceil(interval * 30 - 1e-6))
      }),
    )
  })

  test("a duration off the frame grid ends on the tick that crosses zero", () => {
    expect(ticksUntilZero(1.25)).toBe(38)
    expect(ticksUntilZero(0.678)).toBe(21)
  })

  test("a remainder within the tolerance is zero", () => {
    expect(countdown(TICK + READY_EPSILON / 2, TICK)).toBe(0)
    expect(countdown(TICK + 2 * READY_EPSILON, TICK)).toBeGreaterThan(0)
    expect(countdown(0, TICK)).toBe(0)
  })
})

describe("reached", () => {
  test("300 gains of one thirtieth reach 10", () => {
    expect(ticksUntilReached(10, 1 / 30)).toBe(300)
  })

  test("n gains of one thirtieth reach n thirtieths", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 3000 }), (frames) => {
        expect(ticksUntilReached(frames / 30, 1 / 30)).toBe(frames)
      }),
    )
  })

  test("a value short by more than the tolerance has not reached the target", () => {
    expect(reached(1 - 2 * READY_EPSILON, 1)).toBe(false)
    expect(reached(1 - READY_EPSILON / 2, 1)).toBe(true)
    expect(reached(1.5, 1)).toBe(true)
  })
})
