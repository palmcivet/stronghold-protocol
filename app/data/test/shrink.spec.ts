import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { expect, test } from "vitest"
import { dataWorkspace } from "#compiler/workspace.js"
import { parseArgs, shrinkGuard } from "#compiler/media/fetch/assets.js"
import { droppedEntries } from "#compiler/media/fetch/manifest.js"

const seasonAssets = join(dataWorkspace().seasonDir("act2autochess"), "assets.json")

test("droppedEntries lists leaves the new manifest lacks", () => {
  const prev = {
    version: 1,
    hash: "a",
    generator: "x",
    stats: { files: 3 },
    audio: { sfx: { ui: { timer: "/t.mp3", click: "/c.mp3" }, units: { u1: { hit: "/h.mp3", skills: { 0: "/s.mp3" } } } } },
    chars: { c1: { avatar: "/a.png", spine: { textures: ["/x.png"] } }, c2: { avatar: "/b.png" } },
    ui: { gone: {} },
  }
  const next = {
    version: 2,
    hash: "b",
    generator: "y",
    stats: { files: 9 },
    audio: { sfx: { ui: { click: "/c2.mp3", extra: "/e.mp3" }, units: {} } },
    chars: { c1: { avatar: { lo: "/a.png" }, spine: { textures: [] } }, c3: { avatar: "/z.png" } },
  }
  expect(droppedEntries(prev, next)).toEqual(["audio.sfx.ui.timer", "audio.sfx.units.u1.hit", "audio.sfx.units.u1.skills.0", "chars.c2.avatar"])
  expect(droppedEntries(next, prev)).toEqual(["audio.sfx.ui.extra", "chars.c3.avatar"])
  expect(droppedEntries(prev, prev)).toEqual([])
  expect(droppedEntries(null, next)).toEqual([])
})

test("parseArgs reads shrink, prune, voice and help", () => {
  expect(parseArgs(["--allow-shrink"]).allowShrink).toBe(true)
  expect(() => parseArgs(["--allow-shrinks"])).toThrow(/unknown option/)
  expect(parseArgs([]).voiceAll).toBe(false)
  expect(parseArgs(["--voice-all"]).voiceAll).toBe(true)
  expect(parseArgs(["--voice-lang=jp"]).voiceLang).toBe("jp")
  expect(parseArgs(["--help"]).help).toBe(true)
  expect(() => parseArgs(["--not-a-flag"])).toThrow(/--allow-shrink/)
  expect(() => parseArgs(["--not-a-flag"])).toThrow(/--prune .*implies --allow-shrink/)
})

test.skipIf(!existsSync(seasonAssets))("a smaller season manifest is refused unless shrink or prune is set", () => {
  const before = statSync(seasonAssets).mtimeMs
  const prev = JSON.parse(readFileSync(seasonAssets, "utf8")) as {
    stats: { files: number }
    hash: string
    audio: { sfx: { units: Record<string, { hit?: unknown }> }; bossBgm: Record<string, { intro?: unknown }> }
    chars: Record<string, unknown>
    ui: Record<string, unknown>
  }
  const next = JSON.parse(JSON.stringify(prev)) as typeof prev
  const gone: string[] = []
  const drop = (path: string): void => {
    const keys = path.split(".")
    const parent = keys.slice(0, -1).reduce<Record<string, unknown> | undefined>((row, key) => {
      const child = row?.[key]
      return child && typeof child === "object" ? (child as Record<string, unknown>) : undefined
    }, next)
    const leaf = keys.at(-1)
    if (parent && leaf && Object.hasOwn(parent, leaf)) {
      delete parent[leaf]
      gone.push(path)
    }
  }
  for (const key of ["timer", "draft", "battleStart", "artPlace", "killBossAll"]) drop(`audio.sfx.ui.${key}`)
  for (const boss of ["boss_8", "boss_9", "boss_10"]) drop(`audio.bossBgm.${boss}.intro`)
  const unit = Object.entries(prev.audio.sfx.units).find(([, value]) => value && typeof value.hit === "string")
  expect(unit).toBeTruthy()
  drop(`audio.sfx.units.${unit?.[0]}.hit`)
  expect(gone.length).toBeGreaterThanOrEqual(6)
  next.stats = { ...next.stats, files: next.stats.files - gone.length }
  next.hash = "changed"
  next.chars = { ...next.chars, char_new_test: { avatar: "/assets/char/avatar/new.png" } }
  const refused = shrinkGuard(prev, next, parseArgs([]))
  expect(refused.write).toBe(false)
  expect(refused.dropped).toEqual(gone.slice().sort())
  expect(shrinkGuard(prev, next, parseArgs(["--allow-shrink"])).write).toBe(true)
  expect(shrinkGuard(prev, next, parseArgs(["--prune"])).write).toBe(true)
  expect(shrinkGuard(prev, next, parseArgs(["--offline"])).write).toBe(false)
  const grown = JSON.parse(JSON.stringify(prev)) as typeof prev
  grown.chars["char_new_test"] = { avatar: "/x.png" }
  grown.stats.files += 1
  expect(shrinkGuard(prev, grown, parseArgs([]))).toEqual({ dropped: [], write: true })
  expect(shrinkGuard(null, next, parseArgs([]))).toEqual({ dropped: [], write: true })
  expect(statSync(seasonAssets).mtimeMs).toBe(before)
})

test.skipIf(!existsSync(seasonAssets))("dropping emote and guide keys keeps the current manifest", () => {
  const prev = JSON.parse(readFileSync(seasonAssets, "utf8")) as { ui: Record<string, unknown>; stats: { ui: number } }
  const next = JSON.parse(JSON.stringify(prev)) as typeof prev
  for (const key of Object.keys(next.ui)) if (/^(emoticon|guide)\//.test(key)) delete next.ui[key]
  next.stats = { ...next.stats, ui: Object.keys(next.ui).length }
  const decision = shrinkGuard(prev, next, parseArgs([]))
  expect(decision.write).toBe(false)
  expect(decision.dropped).toHaveLength(36 + 19)
  for (const key of [
    "ui.emoticon/basic/pic_happy_battle",
    "ui.emoticon/fooldoctor/pic_fooldoctor_08_battle",
    "ui.guide/autochess_home_1",
    "ui.guide/autochess_handbook_4",
  ]) {
    expect(decision.dropped).toContain(key)
  }
})
