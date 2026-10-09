import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test } from "vitest"
import { lookupRecord } from "#runtime/packet/record-index.js"
import { readSeasonPackets } from "#runtime/packet/packet-store.js"
import type { PacketFiles } from "#runtime/port/packet-files.js"

const nodePacketFiles: PacketFiles = {
  readText: (path) => readFile(path, "utf8"),
  readDir: async (directory) =>
    (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort(),
}

test("season directory load indexes json and lists what is missing", async () => {
  const directory = await mkdtemp(join(tmpdir(), "packets-"))
  try {
    await writeFile(join(directory, "chess.json"), JSON.stringify({ amiya: { chessId: "amiya" } }))
    const loaded = await readSeasonPackets(nodePacketFiles, directory, ["chess", "bonds"])
    expect(lookupRecord(loaded.documents, "chess", "amiya")?.["chessId"]).toBe("amiya")
    expect(loaded.missing).toEqual(["bonds"])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
