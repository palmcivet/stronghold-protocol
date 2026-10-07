import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { expect, test } from "vitest"
import { appRootFrom } from "#compiler/repo-root.js"
import {
  avatarUrl,
  bandIconUrl,
  bondIconUrl,
  chessAvatarUrl,
  chessPortraitUrl,
  chessSkillIconUrl,
  effectIconUrl,
  enemyIconUrl,
  factionIconUrl,
  itemIconUrl,
  profIconUrl,
  skillIconUrl,
  spineEntry,
  subProfIconUrl,
  titleIconUrl,
  tokenAvatarUrl,
  uiUrl,
} from "#runtime/media/address.js"

const seasonDir = join(appRootFrom(fileURLToPath(import.meta.url)), "product", "season", "act2autochess")
const names = ["assets.json", "chess.json", "bonds.json", "bands.json", "items.json", "enemies.json", "factions.json", "config.json"] as const
const ready = names.every((name) => existsSync(join(seasonDir, name)))
const load = (name: string): unknown => JSON.parse(readFileSync(join(seasonDir, name), "utf8")) as unknown

function manifestUrls(node: unknown, out: Set<string> = new Set()): Set<string> {
  if (typeof node === "string" && node.startsWith("/assets/")) out.add(node)
  else if (node && typeof node === "object") for (const value of Object.values(node)) manifestUrls(value, out)
  return out
}

test.skipIf(!ready)("every visible chess resolves avatar, portrait and skill icon", () => {
  const manifest = load("assets.json") as { chars: Record<string, { avatarE2?: string }> }
  const chess = load("chess.json") as Record<string, { charId?: string; isDiy?: boolean; isGolden?: boolean; chessId?: string; profession?: string; skill?: { iconId?: string } }>
  const all = manifestUrls(manifest)
  const listed = (url: string | null): boolean => url == null || all.has(url)
  let count = 0
  for (const row of Object.values(chess)) {
    if (!row.charId || row.isDiy) continue
    expect(listed(chessAvatarUrl(manifest, row)) && chessAvatarUrl(manifest, row), `avatar ${row.chessId}`).toBeTruthy()
    expect(listed(chessPortraitUrl(manifest, row)) && chessPortraitUrl(manifest, row), `portrait ${row.chessId}`).toBeTruthy()
    expect(listed(chessSkillIconUrl(manifest, row)), `skill ${row.chessId}`).toBe(true)
    expect(listed(profIconUrl(manifest, row.profession ?? ""))).toBe(true)
    expect(listed(subProfIconUrl(manifest, row))).toBe(true)
    count += 1
  }
  expect(count).toBeGreaterThanOrEqual(200)
  const golden = Object.values(chess).find((row) => row.isGolden && row.charId && manifest.chars[row.charId]?.avatarE2)
  expect(golden).toBeTruthy()
  if (golden?.charId) expect(chessAvatarUrl(manifest, golden)).toBe(manifest.chars[golden.charId]?.avatarE2)
})

test.skipIf(!ready)("bonds, bands, items, enemies, tokens, factions, titles and effects resolve", () => {
  const manifest = load("assets.json")
  const all = manifestUrls(manifest)
  const listed = (url: string | null): boolean => url == null || all.has(url)
  for (const id of Object.keys(load("bonds.json") as Record<string, unknown>)) expect(bondIconUrl(manifest, id), id).toBeTruthy()
  for (const id of Object.keys(load("bands.json") as Record<string, unknown>)) expect(bandIconUrl(manifest, id), id).toBeTruthy()
  const items = Object.values(load("items.json") as Record<string, { id?: string }>)
  for (const item of items) expect(listed(itemIconUrl(manifest, item)), item.id).toBe(true)
  expect(itemIconUrl(manifest, items[0])).toBeTruthy()
  const enemies = load("enemies.json") as Record<string, unknown>
  let found = 0
  for (const key of Object.keys(enemies)) {
    const url = enemyIconUrl(manifest, key)
    expect(listed(url), key).toBe(true)
    if (url) found += 1
  }
  expect(found).toBeGreaterThan(Object.keys(enemies).length * 0.9)
  const factions = load("factions.json") as { types: Record<string, { icon: string; type: string }> }
  for (const row of Object.values(factions.types)) expect(factionIconUrl(manifest, row.icon), row.type).toBeTruthy()
  const config = load("config.json") as { titles: { picId: string; id: string }[] }
  for (const title of config.titles) expect(titleIconUrl(manifest, title.picId), title.id).toBeTruthy()
  expect(tokenAvatarUrl(manifest, "token_10028_vigil_wolf")).toBeTruthy()
  expect(effectIconUrl(manifest, { iconKind: "team" })).toBeTruthy()
  expect(effectIconUrl(manifest, { iconKind: "choice" })).toBeTruthy()
  expect(effectIconUrl(manifest, { iconKind: "band", iconId: "band_bldsk" })).toBeTruthy()
  expect(effectIconUrl(manifest, { iconKind: "garrison" })).toBeTruthy()
  expect(effectIconUrl(manifest, { iconKind: "x" })).toBeNull()
  expect(uiUrl(manifest, "hudPanel/icon_hp")).toBeTruthy()
})

test.skipIf(!ready)("missing ids return null", () => {
  const manifest = load("assets.json")
  for (const fn of [chessAvatarUrl, chessPortraitUrl, chessSkillIconUrl, subProfIconUrl, itemIconUrl]) {
    expect(fn(null, null)).toBeNull()
    const empty = fn(manifest, { assets: {} })
    expect(empty ?? null).toBe(fn === chessSkillIconUrl ? uiUrl(manifest, "skillIcon/empty") : null)
  }
  expect(bondIconUrl(manifest, "nope")).toBeNull()
  expect(bandIconUrl(null, "band_bldsk")).toBeNull()
  expect(enemyIconUrl(manifest, "enemy_nope")).toBeNull()
  expect(profIconUrl(manifest, "NOPE")).toBeNull()
  expect(uiUrl(undefined, "x")).toBeNull()
  expect(skillIconUrl(manifest, "nope", false)).toBeNull()
})

const spineReady = ["assets.json", "chess.json", "enemies.json", "bonds.json"].every((name) => existsSync(join(seasonDir, name)))

test.skipIf(!spineReady)("pool chess and enemies resolve from the season manifest", () => {
  const manifest = load("assets.json")
  const chess = load("chess.json") as Record<string, { visible?: boolean; assets?: { avatar?: string; spine?: string }; chessId?: string; skill?: { iconId?: string } }>
  let count = 0
  for (const row of Object.values(chess)) {
    if (!row.visible || !row.assets?.spine) continue
    count += 1
    const avatar = avatarUrl(manifest, row.assets.avatar ?? "")
    expect(avatar?.startsWith("/assets/"), `avatar ${row.chessId}`).toBe(true)
    const spine = spineEntry(manifest, row.assets.spine)
    expect(spine?.skel.endsWith(".skel") && spine.anims && spine.anims["idle"], `spine ${row.chessId}`).toBeTruthy()
    if (row.skill?.iconId) expect(skillIconUrl(manifest, row.skill.iconId, false), `skill icon ${row.chessId}`).toBeTruthy()
  }
  expect(count).toBeGreaterThanOrEqual(200)
  const enemies = load("enemies.json") as Record<string, { spine?: string; key?: string }>
  let withSpine = 0
  let total = 0
  for (const enemy of Object.values(enemies)) {
    total += 1
    if (spineEntry(manifest, enemy.spine || enemy.key || "")) withSpine += 1
  }
  expect(withSpine / total).toBeGreaterThan(0.9)
  expect(spineEntry(manifest, "enemy_5601_entlec")).toBeNull()
  expect(uiUrl(manifest, "battle/sprite_shadow")).toBeTruthy()
  for (const id of Object.keys(load("bonds.json") as Record<string, unknown>)) expect(bondIconUrl(manifest, id), id).toBeTruthy()
})
