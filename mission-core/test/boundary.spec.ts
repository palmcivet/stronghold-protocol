import { expect, test } from "vitest"
import { packageSources } from "#test/source.js"

const IMPORT = /\bfrom\s+"([^"]+)"|\bimport\s*\(\s*"([^"]+)"\s*\)/g

test("kernel 只引用 contract 与 kernel", () => {
  const outside: string[] = []
  for (const file of packageSources()) {
    if (!file.path.startsWith("kernel/") || file.path.endsWith(".test.ts")) continue
    for (const match of file.text.matchAll(IMPORT)) {
      const target = match[1] ?? match[2] ?? ""
      if (!target.startsWith("#kernel/") && !target.startsWith("#contract/")) outside.push(`${file.path} -> ${target}`)
    }
  }
  expect(outside).toEqual([])
})
