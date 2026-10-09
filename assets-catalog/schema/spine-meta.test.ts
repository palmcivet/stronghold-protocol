import { expect, test } from "vitest"
import { isSpineMeta, spineMetaIssues } from "#schema/spine-meta.js"

const META = {
  spineVersion: "3.8.99",
  premultipliedAlpha: false,
  bounds: { x: -60.5, y: -2, width: 121, height: 140.25 },
  animations: {
    Idle: { duration: 1.3333, events: [] },
    Attack: { duration: 0.9, events: [{ name: "OnAttack", time: 0.4 }] },
  },
  pages: ["enemy_1007_slime.png"],
  missingRegions: [],
}

test("a sidecar with Spine facts passes", () => {
  expect(spineMetaIssues(META)).toEqual([])
  expect(isSpineMeta({ ...META, bounds: null, animations: {} })).toBe(true)
})

test("broken sidecars report their paths", () => {
  expect(
    spineMetaIssues({
      ...META,
      spineVersion: "",
      premultipliedAlpha: 1,
      bounds: { x: 0, y: 0, width: -1, height: Number.NaN },
      animations: { Attack: { duration: -1, events: [{ name: "", time: -0.1 }] }, "Die 2": 3 },
      pages: [""],
      missingRegions: "x",
    }),
  ).toEqual([
    { path: "spineVersion", message: "expected a non-empty string" },
    { path: "premultipliedAlpha", message: "expected a boolean" },
    { path: "bounds.width", message: "expected a finite number >= 0" },
    { path: "bounds.height", message: "expected a finite number >= 0" },
    { path: "animations.Attack.duration", message: "expected a finite number >= 0" },
    { path: "animations.Attack.events[0].name", message: "expected a non-empty string" },
    { path: "animations.Attack.events[0].time", message: "expected a finite number >= 0" },
    { path: 'animations["Die 2"]', message: "expected an object" },
    { path: "pages[0]", message: "expected a non-empty string" },
    { path: "missingRegions", message: "expected an array" },
  ])
})
