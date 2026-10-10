import { describe, expect, test } from "vitest"
import { checkCaseMap, globToRegExp, hasFailures, parseInventory, parseMapping, type Mapping } from "#case-map/check.js"
import { numberDuplicates, workspacePatterns } from "#case-map/enumerate.js"

function mapping(overrides: Partial<Mapping> = {}): Mapping {
  return {
    upstream: { repo: "owner/repo", commit: "1db8e510" },
    caseByCase: ["sim/**"],
    rules: [{ match: "ui/**", status: "moved", owner: "app/client" }],
    cases: {
      "sim/a.test.js::one": { status: "covered", next: ["core/a.test.ts::a > one"] },
      "sim/a.test.js::two": { status: "pending", step: "ECS 5" },
    },
    ...overrides,
  }
}

describe("globToRegExp", () => {
  test("** crosses directories and * stays inside one", () => {
    expect(globToRegExp("ui/**").test("ui/deep/x.test.js::name")).toBe(true)
    expect(globToRegExp("*.test.js").test("root.test.js::name")).toBe(true)
    expect(globToRegExp("*.test.js").test("ui/x.test.js::name")).toBe(false)
  })

  test("after :: a star matches any characters, slashes included", () => {
    const pattern = globToRegExp("render/assets.test.js::*Spine*")
    expect(pattern.test("render/assets.test.js::loads a/b Spine model")).toBe(true)
    expect(pattern.test("render/assets.test.js::loads an image")).toBe(false)
  })

  test("regular expression characters in the pattern are literal", () => {
    expect(globToRegExp("a.test.js::x (y)").test("a.test.js::x (y)")).toBe(true)
    expect(globToRegExp("a.test.js::x (y)").test("aXtest.js::x (y)")).toBe(false)
  })
})

describe("checkCaseMap", () => {
  const next = ["core/a.test.ts::a > one"]

  test("every case resolved by an entry or a rule passes", () => {
    const report = checkCaseMap({ mapping: mapping(), inventory: null, master: ["sim/a.test.js::one", "sim/a.test.js::two", "ui/x.test.js::y"], next })
    expect(report).toMatchObject({ total: 3, byCase: 2, unmapped: [], dangling: [], notCaseByCase: [] })
    expect(report.byStatus).toEqual({ covered: 1, rewritten: 0, moved: 1, "not-migrated": 0, pending: 1 })
    expect(report.byRule).toEqual({ "ui/**": 1 })
    expect(hasFailures(report)).toBe(false)
  })

  test("a case with neither entry nor rule is unmapped", () => {
    const report = checkCaseMap({ mapping: mapping(), inventory: null, master: ["match/x.test.js::y"], next })
    expect(report.unmapped).toEqual(["match/x.test.js::y"])
    expect(hasFailures(report)).toBe(true)
  })

  test("a reference to a missing next case is dangling", () => {
    const report = checkCaseMap({ mapping: mapping(), inventory: null, master: ["sim/a.test.js::one", "sim/a.test.js::two"], next: [] })
    expect(report.dangling).toEqual([{ id: "sim/a.test.js::one", next: "core/a.test.ts::a > one" }])
    expect(hasFailures(report)).toBe(true)
  })

  test("a case-by-case case resolved only by a rule fails", () => {
    const rules: Mapping["rules"] = [{ match: "sim/**", status: "pending", step: "ECS 6" }]
    const report = checkCaseMap({ mapping: mapping({ rules }), inventory: null, master: ["sim/b.test.js::three"], next })
    expect(report.notCaseByCase).toEqual(["sim/b.test.js::three"])
    expect(hasFailures(report)).toBe(true)
  })

  test("the inventory gives new and vanished cases, and entries without a case are listed", () => {
    const inventory = { commit: "1db8e510", cases: ["sim/a.test.js::one", "sim/a.test.js::gone"] }
    const report = checkCaseMap({ mapping: mapping(), inventory, master: ["sim/a.test.js::one", "ui/x.test.js::new"], next })
    expect(report.added).toEqual(["ui/x.test.js::new"])
    expect(report.vanished).toEqual(["sim/a.test.js::gone"])
    expect(report.staleEntries).toEqual(["sim/a.test.js::two"])
    expect(hasFailures(report)).toBe(false)
  })

  test("a rule matching nothing is reported", () => {
    const report = checkCaseMap({ mapping: mapping(), inventory: null, master: ["sim/a.test.js::one", "sim/a.test.js::two"], next })
    expect(report.unusedRules).toEqual(["ui/**"])
  })
})

describe("parseMapping", () => {
  test("accepts a complete mapping and fills caseByCase", () => {
    const { caseByCase: _ignored, ...rest } = mapping()
    const parsed = parseMapping(rest)
    expect(parsed).toEqual({ mapping: { ...mapping(), caseByCase: [] } })
  })

  test("each status needs its own field", () => {
    const parsed = parseMapping({
      ...mapping(),
      cases: {
        "a::1": { status: "rewritten", next: ["x::y"] },
        "a::2": { status: "moved" },
        "a::3": { status: "not-migrated", reason: " " },
        "a::4": { status: "pending" },
        "a::5": { status: "covered", next: [] },
      },
    })
    expect("issues" in parsed && parsed.issues.length).toBe(5)
  })

  test("rules cannot claim coverage", () => {
    const parsed = parseMapping({ ...mapping(), rules: [{ match: "ui/**", status: "covered", next: ["x::y"] }] })
    expect("issues" in parsed).toBe(true)
  })

  test("the inventory needs a commit and a case list", () => {
    expect(parseInventory({ commit: "1db8e510", cases: ["a::b"] })).toEqual({ inventory: { commit: "1db8e510", cases: ["a::b"] } })
    expect("issues" in parseInventory({ cases: [] })).toBe(true)
  })
})

describe("enumeration helpers", () => {
  test("same names in one file get #2, #3 in order", () => {
    expect(numberDuplicates(["a", "b", "a", "a > c", "a"])).toEqual(["a", "b", "a #2", "a > c", "a #3"])
  })

  test("workspace patterns come from the packages list only", () => {
    const yaml = 'packages:\n  - "app/*"\n  - mission-core\ncatalog:\n  vite: ^7\n'
    expect(workspacePatterns(yaml)).toEqual(["app/*", "mission-core"])
  })
})
