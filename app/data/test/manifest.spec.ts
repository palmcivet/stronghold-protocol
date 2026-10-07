import { existsSync, readFileSync, statSync } from "node:fs"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { catalogPackageRoot, Downloader, type DownloadJob } from "arknights-assets-catalog/compile"
import { expect, test } from "vitest"
import { appRootFrom } from "#compiler/repo-root.js"
import { indexAudio } from "#compiler/media/fetch/audio-bank.js"
import { emoteCatalog } from "#compiler/media/fetch/emote-catalog.js"
import { collectLeaves, downloadLeaves, resolveTemplate, type TemplateLeaf } from "#compiler/media/fetch/manifest.js"
import { buildPlan, guidePages } from "#compiler/media/fetch/plan.js"

const appRoot = appRootFrom(fileURLToPath(import.meta.url))
const catalogRoot = catalogPackageRoot()
const mediaRoot = join(catalogRoot, "product", "media")
const fontRoot = join(catalogRoot, "product", "font")
const seasonDir = join(appRoot, "product", "season", "act2autochess")
const manifestPath = join(seasonDir, "assets.json")
const haveManifest = existsSync(manifestPath)
const haveMedia = existsSync(mediaRoot)
const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8")) as unknown

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

test("template resolution drops missing files and uses fallbacks", () => {
  const template = {
    a: { alts: [{ rel: "nope/x.png", urls: ["u1"] }] },
    b: { c: { alts: [{ rel: "nope/y.png", urls: ["u2"] }] } },
    keep: "v",
    m: { model: "k" },
  }
  const resolved = resolveTemplate(template, {
    root: appRoot,
    spine: new Map([["k", { skel: "/assets/s.skel", atlas: "/assets/s.atlas", textures: [] }]]),
  })
  expect(Object.keys(resolved.value).sort()).toEqual(["keep", "m"])
  expect([...resolved.misses].sort()).toEqual(["a", "b.c"])
  expect(collectLeaves(template)).toHaveLength(2)
  const ok = resolveTemplate(
    { p: { alts: [{ rel: "nope.png", urls: ["x"] }, { rel: "package.json", urls: ["y"] }] } },
    { root: appRoot, spine: new Map() },
  )
  expect(ok.value["p"]).toBe("/assets/package.json")
  expect(ok.fallbacks).toHaveLength(1)
})

test("leaf fallbacks follow 404s only, never transient errors", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sp-assets-"))
  try {
    const base = "https://raw.githubusercontent.com/o/r/main/"
    const calls: string[] = []
    const routes: Record<string, { body: Buffer; status?: number }> = {
      [`${base}fallback.png`]: { body: png },
      [`${base}flaky.png`]: { status: 503, body: Buffer.from("busy") },
      "https://cdn.jsdelivr.net/gh/o/r@main/flaky.png": { status: 503, body: Buffer.from("busy") },
    }
    const fetchImpl: typeof fetch = async (url) => {
      const key = String(url)
      calls.push(key)
      const route = routes[key]
      if (!route) return new Response("404: Not Found", { status: 404 })
      return new Response(route.body, { status: route.status ?? 200 })
    }
    const dl = new Downloader({ root: join(dir, "out"), ledgerPath: join(dir, "ledger.json"), fetchImpl, backoffMs: 0, log: () => {} })
    const leaves: TemplateLeaf[] = [
      {
        path: "gone",
        leaf: {
          alts: [
            { rel: "g.png", urls: [`${base}gone.png`], kind: "png" },
            { rel: "g.png", urls: [`${base}fallback.png`], kind: "png" },
          ],
        },
      },
      {
        path: "flaky",
        leaf: {
          alts: [
            { rel: "f.png", urls: [`${base}flaky.png`], kind: "png" },
            { rel: "f.png", urls: [`${base}fallback.png`], kind: "png" },
          ],
        },
      },
    ]
    const blocked = await downloadLeaves(leaves, dl, join(dir, "out"))
    expect(blocked).toEqual(["flaky"])
    expect(readFileSync(join(dir, "out", "g.png")).equals(png)).toBe(true)
    expect(existsSync(join(dir, "out", "f.png"))).toBe(false)
    expect(calls.filter((url) => url.endsWith("fallback.png"))).toHaveLength(1)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("a rebuilt manifest lists emote and guide copies that are on disk", async () => {
  const root = await mkdtemp(join(tmpdir(), "sp-mirror-art-"))
  try {
    const ui = buildPlan({ assets07: {}, ops03: {}, enemies05: {}, maps05: {}, audio: indexAudio({}), modelsData: {} }).template.ui
    const keys = ["emoticon/basic/pic_happy_battle", "guide/autochess_home_1", "emoticon/slug/pic_bye_battle"]
    for (const key of keys.slice(0, 2)) {
      const leaf = ui[key] as { alts: DownloadJob[] }
      const rel = leaf.alts[0]?.rel
      if (!rel) throw new Error(key)
      await mkdir(join(root, dirname(rel)), { recursive: true })
      await writeFile(join(root, rel), "x")
    }
    const picked = Object.fromEntries(keys.map((key) => [key, ui[key]]))
    const resolved = resolveTemplate({ ui: picked }, { root, spine: new Map() })
    expect(resolved.value["ui"]).toEqual({
      "emoticon/basic/pic_happy_battle": "/assets/ui/emoticon/basic/pic_happy_battle.png",
      "guide/autochess_home_1": "/assets/ui/guide/autochess_home_1.png",
    })
    expect(resolved.misses).toEqual(["ui.emoticon/slug/pic_bye_battle"])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test.skipIf(!haveManifest)("the season manifest lists every battle emote and guide page", () => {
  const manifest = readJson(manifestPath) as { ui: Record<string, string>; stats: { ui: number } }
  for (const emote of emoteCatalog) {
    expect(manifest.ui[`emoticon/${emote.dir}/${emote.picId}`], emote.id).toBe(`/assets/ui/emoticon/${emote.dir}/${emote.picId}.png`)
  }
  for (const key of guidePages) expect(manifest.ui[`guide/${key}`], key).toBe(`/assets/ui/guide/${key}.png`)
  expect(manifest.stats.ui).toBe(Object.keys(manifest.ui).length)
  expect(JSON.stringify(manifest).includes("/assets/local/")).toBe(false)
})

interface SpineSide {
  readonly skel?: string
  readonly atlas?: string
  readonly textures?: readonly string[]
  readonly anims?: { readonly idle?: string; readonly attack?: { readonly loop?: string }; readonly skills?: Record<string, unknown> }
}

interface SeasonManifest {
  readonly version: number
  readonly hash: string
  readonly chars: Record<string, { readonly avatar?: string; readonly portrait?: string; readonly spine?: { readonly front?: SpineSide } }>
  readonly enemies: Record<string, { readonly icon?: string; readonly spine?: SpineSide }>
  readonly tokens: Record<string, { readonly spine?: SpineSide }>
  readonly bonds: Record<string, unknown>
  readonly items: Record<string, unknown>
  readonly bands: Record<string, unknown>
  readonly skills: Record<string, string>
  readonly skillsById?: Record<string, string>
  readonly ui: Record<string, unknown>
  readonly prof: unknown
  readonly audio: { readonly bgm: Record<string, { readonly loop?: string }>; readonly sfx: { readonly ui: Record<string, unknown>; readonly units: Record<string, unknown> } }
  readonly fonts: { readonly css?: string }
  readonly stats: unknown
}

function loadManifest(): SeasonManifest | null {
  if (!haveManifest) return null
  return readJson(manifestPath) as SeasonManifest
}

function urls(node: unknown, out: string[] = []): string[] {
  if (typeof node === "string") {
    if (/^\/(assets|fonts)\//.test(node)) out.push(node)
  } else if (Array.isArray(node)) for (const item of node) urls(item, out)
  else if (node && typeof node === "object") for (const value of Object.values(node)) urls(value, out)
  return out
}

function onDisk(url: string): string {
  if (url.startsWith("/assets/")) return join(mediaRoot, decodeURIComponent(url.slice("/assets/".length)))
  if (url.startsWith("/fonts/")) return join(fontRoot, decodeURIComponent(url.slice("/fonts/".length)))
  return join(mediaRoot, url)
}

test.skipIf(!haveManifest)("generated manifest shape", () => {
  const manifest = loadManifest()
  if (!manifest) return
  expect(manifest.version).toBe(1)
  expect(typeof manifest.hash).toBe("string")
  for (const key of ["chars", "enemies", "tokens", "bonds", "items", "bands", "skills", "ui", "prof", "audio", "fonts", "stats"] as const) {
    expect(manifest[key] && typeof manifest[key] === "object", key).toBeTruthy()
  }
})

test.skipIf(!haveManifest || !haveMedia)("every manifest path exists on disk", () => {
  const manifest = loadManifest()
  if (!manifest) return
  const all = [...new Set(urls(manifest))]
  expect(all.length).toBeGreaterThan(3000)
  const missing = all.filter((url) => !existsSync(onDisk(url)) || statSync(onDisk(url)).size === 0)
  expect(missing).toEqual([])
})

test.skipIf(!haveManifest || !haveMedia)("every visible research operator has avatar, portrait and a front spine", () => {
  const manifest = loadManifest()
  if (!manifest) return
  const ops = readJson(join(appRoot, "data/compiler/input/research/03-operators.json")) as { chess: { isHidden?: boolean; chessType?: string; charId?: string }[] }
  const ids = new Set(ops.chess.filter((row) => !row.isHidden && row.chessType !== "DIY" && row.charId).map((row) => row.charId ?? ""))
  expect(ids.size).toBeGreaterThanOrEqual(100)
  for (const id of ids) {
    const row = manifest.chars[id]
    expect(row, id).toBeTruthy()
    const front = row?.spine?.front
    for (const path of [row?.avatar, row?.portrait, front?.skel, front?.atlas, ...(front?.textures ?? [])]) {
      expect(typeof path === "string" && existsSync(onDisk(path)), `${id}: ${path}`).toBe(true)
    }
  }
})

test.skipIf(!haveManifest || !haveMedia)("pool chars, bonds, items, bands and enemies are covered", () => {
  const manifest = loadManifest()
  if (!manifest) return
  const assets = readJson(join(appRoot, "data/compiler/input/research/07-assets.json")) as {
    operators: Record<string, unknown>
    bonds: Record<string, unknown>
    items: Record<string, unknown>
    bands: Record<string, unknown>
    enemies: Record<string, unknown>
  }
  for (const id of Object.keys(assets.operators)) expect(manifest.chars[id]?.avatar && manifest.chars[id]?.spine?.front, id).toBeTruthy()
  for (const id of Object.keys(assets.bonds)) expect(manifest.bonds[id], id).toBeTruthy()
  for (const id of Object.keys(assets.items)) expect(manifest.items[id], id).toBeTruthy()
  for (const id of Object.keys(assets.bands)) expect(manifest.bands[id], id).toBeTruthy()
  for (const id of Object.keys(assets.enemies)) expect(manifest.enemies[id]?.icon, id).toBeTruthy()
})

const chessPath = join(seasonDir, "chess.json")

test.skipIf(!haveManifest || !haveMedia || !existsSync(chessPath))("every selectable skill has an icon and a spine clip", () => {
  const manifest = loadManifest()
  if (!manifest) return
  const chess = readJson(chessPath) as Record<string, { visible?: boolean; chessId?: string; charId?: string; skills?: { iconId?: string; skillId?: string; index: number }[] }>
  const miss: string[] = []
  const noClip: string[] = []
  let count = 0
  for (const row of Object.values(chess)) {
    if (!row.visible) continue
    for (const skill of row.skills ?? []) {
      count += 1
      const icon = manifest.skills[skill.iconId || skill.skillId || ""] || manifest.skills[manifest.skillsById?.[skill.skillId ?? ""] ?? ""]
      if (!icon || !existsSync(onDisk(icon))) miss.push(`${row.chessId} ${skill.skillId}`)
      if ((row.skills ?? []).length > 1 && !manifest.chars[row.charId ?? ""]?.spine?.front?.anims?.skills?.[String(skill.index)]) {
        noClip.push(`${row.chessId} S${skill.index + 1}`)
      }
    }
  }
  expect(count).toBeGreaterThanOrEqual(500)
  expect(miss).toEqual([])
  expect(noClip).toEqual([])
})

test.skipIf(!haveManifest || !haveMedia)("audio has bgm phases, ui sfx and a font stylesheet", () => {
  const manifest = loadManifest()
  if (!manifest) return
  const { bgm, sfx } = manifest.audio
  for (const key of ["lobby", "prep", "combat", "boss"]) expect(bgm[key]?.loop, `bgm ${key}`).toBeTruthy()
  for (const key of ["buy", "sell", "refresh", "levelup", "merge", "ready", "timer", "error", "draft"]) expect(sfx.ui[key], `sfx.ui.${key}`).toBeTruthy()
  const units = Object.values(sfx.units)
  expect(units.length).toBeGreaterThan(300)
  for (const unit of units) for (const value of Object.values(unit as Record<string, unknown>)) {
    expect(typeof value === "string" || (value && typeof value === "object")).toBeTruthy()
  }
  expect(manifest.fonts.css && existsSync(onDisk(manifest.fonts.css))).toBeTruthy()
})
