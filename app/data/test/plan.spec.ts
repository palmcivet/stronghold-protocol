import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { mirrorUrl, type DownloadJob } from "arknights-assets-catalog/compile"
import { expect, test } from "vitest"
import { appRootFrom } from "#compiler/repo-root.js"
import { indexAudio } from "#compiler/media/fetch/audio-bank.js"
import { EMOTE_CATALOG } from "#compiler/media/fetch/emote-catalog.js"
import { buildPlan, collectEnemyIds, GUIDE_PAGES, skillIndicesByChar, UI_EXTRAS } from "#compiler/media/fetch/plan.js"

const appRoot = appRootFrom(fileURLToPath(import.meta.url))
const researchDir = join(appRoot, "compiler/input/research")
const readJson = (name: string): unknown => JSON.parse(readFileSync(join(researchDir, name), "utf8")) as unknown

const aa2 = "https://raw.githubusercontent.com/ArknightsAssets/ArknightsAssets2/cn/assets/dyn/"

function planUi(): Record<string, unknown> {
  return buildPlan({
    assets07: {},
    ops03: {},
    enemies05: {},
    maps05: {},
    audio: indexAudio({}),
    modelsData: {},
  }).template.ui
}

function altsOf(node: unknown): DownloadJob[] | null {
  if (!node || typeof node !== "object" || !("alts" in node) || !Array.isArray(node.alts)) return null
  return node.alts as DownloadJob[]
}

test("enemy set covers the research list, bosses and summons", () => {
  const assets07 = readJson("07-assets.json") as { enemies: Record<string, unknown> }
  const ids = new Set(
    collectEnemyIds({
      assets07,
      enemies05: readJson("05-enemies.json"),
      maps05: readJson("05-maps.json"),
      ops03: readJson("03-operators.json"),
    }),
  )
  for (const id of Object.keys(assets07.enemies)) expect(ids.has(id), id).toBe(true)
  for (const id of [
    "enemy_9013_acstmk",
    "enemy_9016_acstmr",
    "enemy_9017_achunt",
    "enemy_9021_acduml",
    "enemy_9023_acdums",
    "enemy_1521_dslily",
    "enemy_2016_csphtm",
    "enemy_9032_aclionk",
    "enemy_10028_vtswd",
    "enemy_9033_acdeer",
    "enemy_9013_acstmk_2",
    "enemy_9012_acloon",
    "enemy_5601_entlec",
  ]) {
    expect(ids.has(id), id).toBe(true)
  }
})

test("skill indices per char put the primary first", () => {
  const indices = skillIndicesByChar(readJson("03-operators.json"))
  expect(indices.get("char_102_texas")).toEqual([1])
  expect(indices.size).toBe(138)
  expect([...(indices.get("char_603_csnipe") ?? [])].sort()).toEqual([1, 2])
})

test("the plan fetches battle emotes and guide pages from ArknightsAssets2", () => {
  const ui = planUi()
  expect(EMOTE_CATALOG).toHaveLength(36)
  for (const emote of EMOTE_CATALOG) {
    const key = `emoticon/${emote.dir}/${emote.picId}`
    expect(altsOf(ui[key]), key).toEqual([
      {
        rel: `ui/${key}.png`,
        urls: [`${aa2}ui/emoticon/theme/%5Buc%5D${emote.themeId}/icon/${emote.picId}.png`],
        kind: "png",
      },
    ])
  }
  expect(ui["emoticon/fooldoctor/pic_fooldoctor_08_battle"]).toBeTruthy()
  expect(altsOf(ui["emoticon/slug/pic_thanks_battle"])?.[0]?.rel).not.toBe(altsOf(ui["emoticon/basic/pic_thanks_battle"])?.[0]?.rel)
  expect(GUIDE_PAGES.slice(0, 2)).toEqual(["autochess_home_1", "autochess_home_2"])
  expect(GUIDE_PAGES).toHaveLength(19)
  for (const key of GUIDE_PAGES) {
    expect(altsOf(ui[`guide/${key}`]), key).toEqual([
      {
        rel: `ui/guide/${key}.png`,
        urls: [`${aa2}arts/guidebookpages/%5Bpack%5Dautochess/${key}.png`],
        kind: "png",
      },
    ])
  }
  const rels = Object.values(ui).map((leaf) => altsOf(leaf)?.[0]?.rel ?? "")
  expect(new Set(rels).size).toBe(rels.length)
  expect(rels.every((rel) => !rel.startsWith("local/"))).toBe(true)
  const foold = altsOf(ui["emoticon/fooldoctor/pic_fooldoctor_08_battle"])?.[0]?.urls[0]
  expect(mirrorUrl(foold ?? "")).toBe(
    "https://cdn.jsdelivr.net/gh/ArknightsAssets/ArknightsAssets2@cn/assets/dyn/ui/emoticon/theme/%5Buc%5Demoticon_foolsday_doctor/icon/pic_fooldoctor_08_battle.png",
  )
  expect(Object.isFrozen(UI_EXTRAS)).toBe(true)
  expect(UI_EXTRAS.every((row) => Object.isFrozen(row))).toBe(true)
})
