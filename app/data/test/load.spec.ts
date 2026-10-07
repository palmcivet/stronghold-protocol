import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { nodeCatalogFiles } from "arknights-assets-catalog"
import { expect, test } from "vitest"
import { lookupRecord } from "#runtime/packet/record-index.js"
import { readSeasonPackets } from "#runtime/packet/packet-store.js"

test("season directory load indexes json and lists what is missing", async () => {
  const directory = await mkdtemp(join(tmpdir(), "packets-"))
  try {
    await nodeCatalogFiles.writeTextAtomic(join(directory, "chess.json"), JSON.stringify({ amiya: { chessId: "amiya" } }))
    const loaded = await readSeasonPackets(nodeCatalogFiles, directory, ["chess", "bonds"])
    expect(lookupRecord(loaded.documents, "chess", "amiya")?.["chessId"]).toBe("amiya")
    expect(loaded.missing).toEqual(["bonds"])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
