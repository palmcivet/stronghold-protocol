import { describe, expect, it } from "vitest"
import { MISSION_EVENT_BINDINGS, createMissionCueBindings } from "#effect/binding.js"

describe("cue bindings", () => {
  it("starts from the core event bindings and rebinds a core event", () => {
    const bindings = createMissionCueBindings()
    expect(bindings.get("damaged")).toEqual(MISSION_EVENT_BINDINGS.damaged)
    bindings.bind("damaged", { effect: null, sound: null })
    expect(bindings.get("damaged")).toEqual({ effect: null, sound: null })
  })

  it("binds cue kinds and namespaced mod events, and leaves other keys unbound", () => {
    const bindings = createMissionCueBindings()
    bindings.bind("cue:snow-storm", { effect: null, sound: "hit" })
    bindings.bind("my-mod:doll-swap", { effect: null, sound: null })
    expect(bindings.get("cue:snow-storm")?.sound).toBe("hit")
    expect(bindings.get("my-mod:doll-swap")).toEqual({ effect: null, sound: null })
    expect(bindings.get("other-mod:thing")).toBeUndefined()
  })

  it("refuses the bare cue event, unknown core names and malformed keys", () => {
    const bindings = createMissionCueBindings()
    expect(() => bindings.bind("cue" as never, { effect: null, sound: null })).toThrow(/cue:<kind>/)
    expect(() => bindings.bind("doll-swap" as never, { effect: null, sound: null })).toThrow(/namespace/)
    expect(() => bindings.bind("My:Thing", { effect: null, sound: null })).toThrow(RangeError)
  })

  it("refuses binding once sealed", () => {
    const bindings = createMissionCueBindings()
    bindings.seal()
    expect(() => bindings.bind("hit", { effect: null, sound: null })).toThrow(/sealed/)
  })

  it("keeps the declared cue kinds and refuses malformed or late declarations", () => {
    const bindings = createMissionCueBindings()
    bindings.declare("snow-storm", "sword-wave")
    bindings.declare("snow-storm")
    expect(bindings.declared()).toEqual(["snow-storm", "sword-wave"])
    expect(() => bindings.declare("Snow")).toThrow(RangeError)
    bindings.seal()
    expect(() => bindings.declare("blast")).toThrow(/sealed/)
  })
})
