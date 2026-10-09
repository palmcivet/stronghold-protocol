import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { AssetKey } from "arknights-assets-catalog"
import { expect, test } from "vitest"
import { AssetLedger, type LedgerRecord } from "#download/ledger.js"
import { nodeBuildFiles } from "#port/node-files.js"

function record(key: string, from: string, hash: string): LedgerRecord {
  return { key: key as AssetKey, from: from as AssetKey, role: "main", name: null, format: "png", source: "s", repo: "o/r@b", revision: "c", path: "p.png", inputHash: "i", bytes: 1, hash }
}

test("records by need, replaced as a group, saved sorted", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sp-ledger-"))
  try {
    const path = join(dir, "ledger.json")
    const empty = await AssetLedger.load(nodeBuildFiles, path)
    expect(empty.recordsFrom("image:a" as AssetKey).size).toBe(0)
    empty.replaceFrom("image:z" as AssetKey, new Map([["image/z.png", record("image:z", "image:z", "1")]]))
    empty.replaceFrom("image:a" as AssetKey, new Map([["image/a.png", record("image:a", "image:a", "2")], ["image/b.png", record("image:b", "image:a", "3")]]))
    empty.replaceFrom("image:a" as AssetKey, new Map([["image/a.png", record("image:a", "image:a", "4")]]))
    await empty.save(nodeBuildFiles)
    const text = await nodeBuildFiles.readText(path)
    expect(Object.keys(JSON.parse(text).files)).toEqual(["image/a.png", "image/z.png"])
    const loaded = await AssetLedger.load(nodeBuildFiles, path)
    expect([...loaded.recordsFrom("image:a" as AssetKey).values()].map((row) => row.hash)).toEqual(["4"])
    await loaded.save(nodeBuildFiles)
    expect(await nodeBuildFiles.readText(path)).toBe(text)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
