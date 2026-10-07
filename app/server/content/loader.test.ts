import { expect, test } from "vitest"
import type { ContentPackage } from "#server/content/loader.js"
import { arrangeContent, battleModules, contentPackages, loadListed, registerAllMeta, registerPackages } from "#server/content/loader.js"
import type { EffectHandler, EffectRegistry } from "#server/content/effect.js"
import { CONTENT_INTERFACE_VERSION, CONTENT_VERSION } from "#server/content/version.js"

function pkg(id: string, dependencies: readonly string[], interfaceVersion = CONTENT_INTERFACE_VERSION): ContentPackage {
  return {
    manifest: { id, version: CONTENT_VERSION, interfaceVersion, dependencies, entries: [{ id }] },
  }
}

function memoryRegistry(): { registry: EffectRegistry; keys: () => string[] } {
  const map = new Map<string, EffectHandler>()
  const registry: EffectRegistry = {
    register(key, handler) {
      map.set(key, typeof handler === "function" ? { run: handler } : handler)
      return registry
    },
    get(key) {
      return map.get(key) ?? null
    },
    garrison(key, handler) {
      return registry.register(`garrison:${key}`, handler)
    },
    band(key, handler) {
      return registry.register(`band:${key}`, handler)
    },
    bond(key, handler) {
      return registry.register(`bond:${key}`, handler)
    },
    item(key, handler) {
      return registry.register(`item:${key}`, handler)
    },
    choice(key, handler) {
      return registry.register(`choice:${key}`, handler)
    },
    effect(key, handler) {
      return registry.register(`effect:${key}`, handler)
    },
    global(key, handler) {
      return registry.register(`global:${key}`, handler)
    },
  }
  return { registry, keys: () => [...map.keys()] }
}

test("packages load in dependency order and a missing dependency is dropped", () => {
  const ordered = arrangeContent([
    pkg("band", ["item"]),
    pkg("item", ["garrison"]),
    pkg("garrison", []),
    pkg("choice", ["missing"]),
  ])
  expect(ordered.map((entry) => entry.manifest.id)).toEqual(["garrison", "item", "band"])
})

test("a package that fails to load is dropped", async () => {
  const loaded = await loadListed([
    { id: "ok", load: async () => ({ contentPackage: pkg("ok", []) }) },
    { id: "bad", load: async () => { throw new Error("boom") } },
    { id: "old", load: async () => ({ contentPackage: pkg("old", [], 0) }) },
  ])
  expect(loaded.map((entry) => entry.manifest.id)).toEqual(["ok"])
})

test("one registerMeta failure does not skip the next package", () => {
  const { registry, keys } = memoryRegistry()
  registerPackages(registry, [
    { manifest: pkg("a", []).manifest, registerMeta() { throw new Error("nope") } },
    { manifest: pkg("b", []).manifest, registerMeta(target) { target.global("kept", {}) } },
  ])
  expect(keys()).toEqual(["global:kept"])
})

test("shipped content registers prep handlers and the choice battle module", () => {
  const ids = contentPackages().map((entry) => entry.manifest.id)
  expect(ids).toContain("choice")
  expect(ids.indexOf("garrison")).toBeLessThan(ids.indexOf("item"))
  expect(ids.indexOf("item")).toBeLessThan(ids.indexOf("band"))
  expect(ids.indexOf("band")).toBeLessThan(ids.indexOf("choice"))
  expect(battleModules().map((module) => module.id)).toContain("content:choice")
  const { registry, keys } = memoryRegistry()
  registerAllMeta(registry)
  const registered = keys()
  expect(registered).toContain("garrison:SERVER_ADD_BOND")
  expect(registered).toContain("bond:victoriaShip")
  expect(registered).toContain("bond:deputShip")
  expect(registered).toContain("global:contentb_info")
  expect(registered).toContain("global:bands_ducklord")
  expect(registered).toContain("item:chess_item_2_02_e")
  expect(registered).toContain("choice:allybuff_select_18")
  expect(registered.filter((key) => key.startsWith("band:")).length).toBeGreaterThan(10)
})
