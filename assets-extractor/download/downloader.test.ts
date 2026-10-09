import { existsSync, readFileSync, readdirSync } from "node:fs"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Downloader, type DownloadJob } from "#download/downloader.js"
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

const rawUrl = "https://raw.githubusercontent.com/o/r/main/a.png"
const mirror = "https://cdn.jsdelivr.net/gh/o/r@main/a.png"

interface RouteBody {
  readonly body: Buffer | string
  readonly status?: number
  readonly headers?: Record<string, string>
}

type Route = RouteBody | Error

async function setup(routes: Record<string, Route | Route[]>): Promise<{ dl: Downloader; dir: string; calls: string[]; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), "sp-assets-"))
  const calls: string[] = []
  const fetchImpl: typeof fetch = async (url) => {
    const key = String(url)
    calls.push(key)
    const queued = routes[key]
    const route = Array.isArray(queued) ? (queued.length > 1 ? queued.shift() : queued[0]) : queued
    if (!route) return new Response("404: Not Found", { status: 404 })
    if (route instanceof Error) throw route
    return new Response(route.body, { status: route.status ?? 200, headers: route.headers })
  }
  const dl = new Downloader({ root: join(dir, "out"), ledgerPath: join(dir, "ledger.json"), fetchImpl, backoffMs: 0, log: () => {} })
  return { dl, dir, calls, cleanup: () => rm(dir, { recursive: true, force: true }) }
}

test("mirror fallback after a raw 404, then an idempotent skip", async () => {
  const { dl, dir, calls, cleanup } = await setup({ [mirror]: { body: png } })
  try {
    const job: DownloadJob = { rel: "x/a.png", urls: [rawUrl], kind: "png" }
    const first = await dl.run([job, { ...job }], "t")
    expect(first.get("x/a.png")?.status).toBe("ok")
    expect(calls).toEqual([rawUrl, mirror])
    expect(readFileSync(join(dir, "out", "x", "a.png")).equals(png)).toBe(true)
    expect(JSON.parse(readFileSync(join(dir, "ledger.json"), "utf8")).files["x/a.png"].bytes).toBe(png.length)
    const second = await dl.run([job], "t")
    expect(second.get("x/a.png")?.status).toBe("skip")
    expect(calls).toHaveLength(2)
  } finally {
    await cleanup()
  }
})

test("retries transient errors and rejects invalid payloads", async () => {
  const { dl, dir, cleanup } = await setup({
    [rawUrl]: [new Error("ECONNRESET"), { status: 503, body: "busy" }, { body: png }],
    "https://raw.githubusercontent.com/o/r/main/bad.png": { body: "<html>oops</html>" },
    "https://raw.githubusercontent.com/o/r/main/short.png": { body: png, headers: { "content-length": String(png.length + 5) } },
  })
  try {
    const results = await dl.run(
      [
        { rel: "a.png", urls: [rawUrl], kind: "png" },
        { rel: "bad.png", urls: ["https://raw.githubusercontent.com/o/r/main/bad.png"], kind: "png" },
        { rel: "short.png", urls: ["https://raw.githubusercontent.com/o/r/main/short.png"], kind: "png" },
        { rel: "none.png", urls: ["https://raw.githubusercontent.com/o/r/main/none.png"], kind: "png" },
      ],
      "t",
    )
    expect(results.get("a.png")?.status).toBe("ok")
    expect(results.get("bad.png")?.status).toBe("error")
    expect(results.get("short.png")?.status).toBe("error")
    expect(results.get("none.png")?.status).toBe("miss")
    for (const name of ["bad.png", "short.png", "none.png"]) expect(existsSync(join(dir, "out", name))).toBe(false)
    expect(readdirSync(join(dir, "out"))).toEqual(["a.png"])
  } finally {
    await cleanup()
  }
})
