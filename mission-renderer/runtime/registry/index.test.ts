import { describe, expect, it } from "vitest"
import { createSealedRegistry, isNamespacedId } from "#runtime/registry/index.js"

describe("sealed registry", () => {
  it("accepts kebab-case namespaced ids only", () => {
    expect(["mission:hit-flash", "my-mod:snow/storm", "a1:b2"].every(isNamespacedId)).toBe(true)
    expect(["hit", "Mission:spark", "ns:", ":name", "ns:a:b", "ns:-a"].some(isNamespacedId)).toBe(false)
  })

  it("registers, replaces in place and refuses repeats and unknown replacements", () => {
    const registry = createSealedRegistry<{ id: string; mark: number }>("Thing")
    registry.register({ id: "a:one", mark: 1 })
    registry.register({ id: "b:two", mark: 2 })
    registry.replace({ id: "a:one", mark: 3 })
    expect(registry.values()).toEqual([{ id: "a:one", mark: 3 }, { id: "b:two", mark: 2 }])
    expect(() => registry.register({ id: "a:one", mark: 4 })).toThrow(/twice/)
    expect(() => registry.replace({ id: "c:three", mark: 5 })).toThrow(/not registered/)
    expect(() => registry.register({ id: "plain", mark: 6 })).toThrow(RangeError)
  })

  it("refuses changes once sealed and still reads", () => {
    const registry = createSealedRegistry<{ id: string }>("Thing")
    registry.register({ id: "a:one" })
    registry.seal()
    expect(registry.sealed).toBe(true)
    expect(() => registry.register({ id: "b:two" })).toThrow(/sealed/)
    expect(() => registry.replace({ id: "a:one" })).toThrow(/sealed/)
    expect(registry.has("a:one")).toBe(true)
  })
})
