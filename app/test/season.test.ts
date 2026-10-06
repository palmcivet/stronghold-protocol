import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { nodeCatalogFiles } from "arknights-assets-catalog"
import { artUrls, enemyIconUrl } from "#runtime/media/address.js"
import { lookupMode, lookupRecord } from "#runtime/packet/record-index.js"
import { readSeasonPackets } from "#runtime/packet/packet-store.js"
import { packetAddress } from "#schema/packet-file.js"
import { expect, test } from "vitest"

test("season packet address", () => {
  expect(packetAddress("act2autochess", "chess")).toBe("/data/seasons/act2autochess/chess.json")
  expect(() => packetAddress("../act", "chess")).toThrow(/season id/)
})

test("record lookup ignores prototype names", () => {
  const documents = { chess: { amiya: { chessId: "amiya" } } }
  expect(lookupRecord(documents, "chess", "amiya")?.["chessId"]).toBe("amiya")
  expect(lookupRecord(documents, "chess", "constructor")).toBeNull()
  expect(lookupMode({ config: { modes: { mode_multi_hard: { modeId: "mode_multi_hard" } } } }, "mode_multi_hard")?.["modeId"]).toBe("mode_multi_hard")
})

test("enemy icon and local art prefer the season manifest", () => {
  const manifest = { enemies: { enemy_a_2: {}, enemy_a: { icon: "/assets/enemy/icon/enemy_a.png" } }, ui: { "guide/page": "/assets/ui/guide/page.png" } }
  expect(enemyIconUrl(manifest, "enemy_a_2")).toBe("/assets/enemy/icon/enemy_a.png")
  const urls = artUrls({ groups: { guide: { page: { path: "/assets/local/guide/page.png" } } } }, manifest, "guide", "page")
  expect(urls).toEqual(["/assets/local/guide/page.png", "/assets/ui/guide/page.png"])
})

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
