import { existsSync, readFileSync } from "node:fs"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { kindOf } from "#download/format.js"
import { Downloader, type DownloadJob } from "#download/downloader.js"
import { processModels, type PlannedSpineModel } from "#spine/model.js"
import { expect, test } from "vitest"

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  return Buffer.concat([len, Buffer.from(type, "latin1"), data, Buffer.alloc(4)])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(2, 0)
ihdr.writeUInt32BE(2, 4)
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IEND", Buffer.alloc(0)),
])

test("a corrupt skeleton is dropped and deleted so the next run re-downloads it", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sp-spine-"))
  try {
    const root = join(dir, "assets")
    await mkdir(join(root, "spine", "x"), { recursive: true })
    await writeFile(join(root, "spine", "x", "m.skel"), Buffer.alloc(64, 0xff))
    await writeFile(join(root, "spine", "x", "m.atlas"), "\nm.png\nformat: RGBA8888\nfilter: Linear,Linear\nrepeat: none\nR\n  xy: 0, 0\n  size: 1, 1\n")
    await writeFile(join(root, "spine", "x", "m.png"), png)
    const job = (rel: string): DownloadJob => ({ rel, urls: ["u"], kind: kindOf(rel) })
    const models = new Map<string, PlannedSpineModel>([
      [
        "k",
        {
          key: "k",
          kind: "char",
          dir: "spine/x/",
          pma: false,
          skillIndices: [0],
          baseUrl: "",
          skel: job("spine/x/m.skel"),
          atlas: { ...job("spine/x/m.atlas"), mutable: true },
          pngs: [job("spine/x/m.png")],
        },
      ],
    ])
    let saved = 0
    const dl = {
      ledger: { files: { "spine/x/m.skel": { url: "u", bytes: 64 } } },
      saveLedger: async () => {
        saved += 1
      },
    } as unknown as Downloader
    const result = await processModels(models, { root, dl, cachePath: join(dir, "cache.json"), download: false, log: () => {} })
    expect(result.entries.size).toBe(0)
    expect(result.problems.join("\n")).toMatch(/skel parse failed/)
    expect(existsSync(join(root, "spine", "x", "m.skel"))).toBe(false)
    expect(dl.ledger.files["spine/x/m.skel"]).toBeUndefined()
    expect(saved).toBe(1)
    expect(readFileSync(join(root, "spine", "x", "m.atlas"), "utf8")).toMatch(/size: 2,2/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
