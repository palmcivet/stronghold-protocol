import { expect, test } from "vitest"
import { parseExtractArgs, UsageError } from "#script/extract.js"

test("flags and defaults", () => {
  expect(parseExtractArgs(["--needs", "a.json", "b.json", "--cache", "c"])).toEqual({
    needs: ["a.json", "b.json"],
    cacheDir: "c",
    offline: false,
    force: false,
    refreshIndex: false,
    proxy: null,
    timeoutMs: 600_000,
    help: false,
  })
  expect(parseExtractArgs(["--needs=a.json", "--offline", "--force", "--proxy=http://p:1", "--timeout", "5000"])).toMatchObject({ needs: ["a.json"], offline: true, force: true, proxy: "http://p:1", timeoutMs: 5000 })
  expect(parseExtractArgs(["--help"]).help).toBe(true)
})

test("usage errors", () => {
  expect(() => parseExtractArgs([])).toThrow(UsageError)
  expect(() => parseExtractArgs(["--needs"])).toThrow(/at least one/)
  expect(() => parseExtractArgs(["--needs", "a", "--offline", "--refresh-index"])).toThrow(/cannot be combined/)
  expect(() => parseExtractArgs(["--needs", "a", "--timeout", "0"])).toThrow(/positive integer/)
  expect(() => parseExtractArgs(["--needs", "a", "--cache"])).toThrow(/needs a value/)
  expect(() => parseExtractArgs(["--needs", "a", "--what"])).toThrow(/unknown option/)
})
