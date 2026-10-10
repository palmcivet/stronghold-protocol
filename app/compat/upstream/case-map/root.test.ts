import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { expect, test } from "vitest"
import { DEFAULT_REPO_DIR, findUp, PACKAGE_ROOT, WORKSPACE_ROOT } from "#case-map/root.js"

test("the package root is the compat upstream package and the default master checkout sits inside it", () => {
  const manifest = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")) as { name: string }
  expect(manifest.name).toBe("arknights-compat-upstream")
  expect(DEFAULT_REPO_DIR).toBe(join(PACKAGE_ROOT, "repo"))
})

test("the workspace root holds pnpm-workspace.yaml and contains the package", () => {
  expect(existsSync(join(WORKSPACE_ROOT, "pnpm-workspace.yaml"))).toBe(true)
  expect(PACKAGE_ROOT.startsWith(WORKSPACE_ROOT)).toBe(true)
  expect(PACKAGE_ROOT).not.toBe(WORKSPACE_ROOT)
})

test("findUp fails when no directory above has the marker", () => {
  expect(() => findUp(PACKAGE_ROOT, "no-such-marker.case-map")).toThrow("no no-such-marker.case-map above")
})
