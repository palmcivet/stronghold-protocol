import type { AssetKey } from "arknights-assets-catalog"
import { describe, expect, test } from "vitest"
import type { RepoWorkspace } from "#download/repo-cache.js"
import { ARK_MODELS_REPO, arkModelsSource, MODELS_DATA, parseModelsData } from "#source/ark-models/adapter.js"
import { ARKNIGHTS_ASSETS_REPO, arknightsAssetsSource } from "#source/arknights-assets/adapter.js"
import type { AssetSource, SourceHit } from "#source/asset-source.js"
import { FEXLI_REPO, fexliSource } from "#source/fexli/adapter.js"
import { FONTS_REPO, fontsSource } from "#source/fonts/adapter.js"
import { GAMEDATA_REPO, gamedataSource } from "#source/gamedata/adapter.js"
import { parsePathTable } from "#source/path-table.js"
import { SOUND_ROOT, VOICE_REPO, voiceSource } from "#source/voice/adapter.js"
import { YUANYAN_REPO, yuanyanSource } from "#source/yuanyan/adapter.js"
import { memoryFiles, MemoryWorkspace, testContext } from "./fixture.js"

async function locator(source: AssetSource, workspace: RepoWorkspace, files = memoryFiles()) {
  const { context, ambiguous } = testContext([workspace], files)
  await source.prepare(context)
  return { ambiguous, locate: (key: string): Promise<SourceHit | null> => source.locate(key as AssetKey, context) }
}

/** Upstream paths of a hit relative to the workspace root, with roles and names. */
function filesOf(workspace: RepoWorkspace, hit: SourceHit | null): string[] {
  expect(hit).not.toBeNull()
  return (hit as SourceHit).files.map((file) => `${file.role}:${file.name ?? "-"}:${file.location.slice(workspace.root.length + 1)}${file.convert ? `>${file.convert}` : ""}`)
}

describe("yuanyan", () => {
  const workspace = new MemoryWorkspace(YUANYAN_REPO, [
    "avatar/char_002_amiya.png",
    "avatar/token_10020_ling_soul3.png",
    "portrait/char_002_amiya_1.png",
    "skin/char_002_amiya_epoque_4.png",
    "enemy/enemy_1007_slime.png",
    "enemy/enemy_9012_acloon.png",
    "item/mtl_sl_g2.png",
    "item_rarity_img/sprite_item_r3.png",
    "skill/skill_icon_skchr_amiya_1.png",
    "skill/skill_icon_skcom_atk_up[1].png",
    "skill/skill_icon_skcom_def_up[1].png",
    "skill/skill_icon_skcom_def_up_1_.png",
  ])

  test("direct rules hit", async () => {
    const { locate } = await locator(yuanyanSource(), workspace)
    expect(filesOf(workspace, await locate("image:char/avatar/char_002_amiya"))).toEqual(["main:-:avatar/char_002_amiya.png"])
    expect(filesOf(workspace, await locate("image:char/portrait/char_002_amiya_1"))).toEqual(["main:-:portrait/char_002_amiya_1.png"])
    expect(filesOf(workspace, await locate("image:skin/portrait/char_002_amiya_epoque_4"))).toEqual(["main:-:skin/char_002_amiya_epoque_4.png"])
    expect(filesOf(workspace, await locate("image:enemy/icon/enemy_1007_slime"))).toEqual(["main:-:enemy/enemy_1007_slime.png"])
    expect(filesOf(workspace, await locate("image:token/icon/token_10020_ling_soul3"))).toEqual(["main:-:avatar/token_10020_ling_soul3.png"])
    expect(filesOf(workspace, await locate("image:token/icon/enemy_9012_acloon"))).toEqual(["main:-:enemy/enemy_9012_acloon.png"])
    expect(filesOf(workspace, await locate("image:item/mtl_sl_g2"))).toEqual(["main:-:item/mtl_sl_g2.png"])
    expect(filesOf(workspace, await locate("image:item/rarity/r3"))).toEqual(["main:-:item_rarity_img/sprite_item_r3.png"])
    const hit = await locate("image:char/avatar/char_002_amiya")
    expect(hit?.revision).toBe(workspace.revision)
    expect(hit?.repo).toBe(workspace)
  })

  test("skill icons are found by safe name", async () => {
    const { locate, ambiguous } = await locator(yuanyanSource(), workspace)
    expect(filesOf(workspace, await locate("image:skill/skchr_amiya_1"))).toEqual(["main:-:skill/skill_icon_skchr_amiya_1.png"])
    expect(filesOf(workspace, await locate("image:skill/skcom_atk_up_1_"))).toEqual(["main:-:skill/skill_icon_skcom_atk_up[1].png"])
    expect(ambiguous).toEqual([])
  })

  test("misses and same-name candidates", async () => {
    const { locate, ambiguous } = await locator(yuanyanSource(), workspace)
    expect(await locate("image:char/avatar/char_999_none")).toBeNull()
    expect(await locate("image:skill/sk_none")).toBeNull()
    expect(await locate("image:char/unknown/char_002_amiya")).toBeNull()
    expect(await locate("audio:voice/cn/char_002_amiya/cn_001")).toBeNull()
    expect(ambiguous).toEqual([])
    expect(await locate("image:skill/skcom_def_up_1_")).toBeNull()
    expect(ambiguous).toEqual([
      { key: "image:skill/skcom_def_up_1_", candidates: ["skill/skill_icon_skcom_def_up[1].png", "skill/skill_icon_skcom_def_up_1_.png"] },
    ])
  })
})

describe("fexli", () => {
  const spine = (dir: string, stem: string, pages = [`${stem}.png`]): string[] => [`${dir}/${stem}.skel`, `${dir}/${stem}.atlas`, ...pages.map((page) => `${dir}/${page}`)]
  const workspace = new MemoryWorkspace(FEXLI_REPO, [
    ...spine("spine/char_002_amiya/char_002_amiya/Front", "char_002_amiya", ["char_002_amiya.png", "char_002_amiya_2.png"]),
    ...spine("spine/char_002_amiya/char_002_amiya/Back", "char_002_amiya_back"),
    ...spine("spine/char_002_amiya/char_002_amiya@epoque#4/Front", "char_002_amiya_epoque#4"),
    ...spine("spine/char_002_amiya/char_002_amiya@epoque#4/Back", "char_002_amiya_epoque#4_back"),
    ...spine("spine/char_003_kalts/char_003_kalts/Front", "a"),
    ...spine("spine/char_003_kalts/char_003_kalts/Front", "b"),
    "spine/char_004_noatlas/char_004_noatlas/Front/char_004_noatlas.skel",
    "spine/char_004_noatlas/char_004_noatlas/Front/char_004_noatlas.png",
    ...spine("spine/token_10001_deepcl_tentacle/token_10001_deepcl_tentacle/Spine", "token_10001_deepcl_tentacle"),
    ...spine("spine/token_10002_one/token_10002_one_variant/Front", "token_10002_one_variant"),
    ...spine("spine/token_10003_two/token_10003_two_a/Front", "token_10003_two_a"),
    ...spine("spine/token_10003_two/token_10003_two_b/Front", "token_10003_two_b"),
  ])

  test("operator, skin and token poses hit", async () => {
    const { locate } = await locator(fexliSource(), workspace)
    expect(filesOf(workspace, await locate("spine:char/char_002_amiya/front"))).toEqual([
      "skel:char_002_amiya.skel:spine/char_002_amiya/char_002_amiya/Front/char_002_amiya.skel",
      "atlas:char_002_amiya.atlas:spine/char_002_amiya/char_002_amiya/Front/char_002_amiya.atlas>atlas",
      "page:char_002_amiya.png:spine/char_002_amiya/char_002_amiya/Front/char_002_amiya.png",
      "page:char_002_amiya_2.png:spine/char_002_amiya/char_002_amiya/Front/char_002_amiya_2.png",
    ])
    const back = await locate("spine:char/char_002_amiya/back")
    expect(back?.path).toBe("spine/char_002_amiya/char_002_amiya/Back")
    expect(back?.premultipliedAlpha).toBe(false)
    expect(filesOf(workspace, await locate("spine:skin/char_002_amiya_epoque_4/front"))[0]).toBe(
      "skel:char_002_amiya_epoque_4.skel:spine/char_002_amiya/char_002_amiya@epoque#4/Front/char_002_amiya_epoque#4.skel",
    )
    expect((await locate("spine:token/token_10001_deepcl_tentacle/front"))?.path).toBe("spine/token_10001_deepcl_tentacle/token_10001_deepcl_tentacle/Spine")
    expect((await locate("spine:token/token_10002_one/front"))?.path).toBe("spine/token_10002_one/token_10002_one_variant/Front")
  })

  test("a summon skin variant is named by its folder", async () => {
    const { locate, ambiguous } = await locator(fexliSource(), workspace)
    expect((await locate("spine:token/token_10003_two/token_10003_two_b"))?.path).toBe("spine/token_10003_two/token_10003_two_b/Front")
    expect(await locate("spine:token/token_10003_two/token_10003_two_c")).toBeNull()
    expect(ambiguous).toEqual([])
  })

  test("misses and ambiguous folders", async () => {
    const { locate, ambiguous } = await locator(fexliSource(), workspace)
    expect(await locate("spine:char/char_999_none/front")).toBeNull()
    expect(await locate("spine:char/char_002_amiya/build")).toBeNull()
    expect(await locate("spine:char/char_004_noatlas/front")).toBeNull()
    expect(await locate("spine:token/token_10001_deepcl_tentacle/back")).toBeNull()
    expect(await locate("spine:enemy/enemy_1007_slime")).toBeNull()
    expect(ambiguous).toEqual([])
    expect(await locate("spine:char/char_003_kalts/front")).toBeNull()
    expect(await locate("spine:token/token_10003_two/front")).toBeNull()
    expect(ambiguous).toEqual([
      { key: "spine:char/char_003_kalts/front", candidates: ["spine/char_003_kalts/char_003_kalts/Front/a.skel", "spine/char_003_kalts/char_003_kalts/Front/b.skel"] },
      { key: "spine:token/token_10003_two/front", candidates: ["spine/token_10003_two/token_10003_two_a/Front", "spine/token_10003_two/token_10003_two_b/Front"] },
    ])
  })
})

describe("ark-models", () => {
  const workspace = new MemoryWorkspace(ARK_MODELS_REPO, [
    MODELS_DATA,
    "models_enemies/1007_slime/enemy_1007_slime.skel",
    "models_enemies/1007_slime/enemy_1007_slime.atlas",
    "models_enemies/1007_slime/enemy_1007_slime.png",
    "models_enemies/1008_ghost/enemy_1008_ghost.skel",
  ])
  const data = {
    storageDirectory: { Enemy: "models_enemies" },
    data: {
      "1007_slime": { assetList: { ".skel": "enemy_1007_slime.skel", ".atlas": ["enemy_1007_slime$1.atlas", "enemy_1007_slime.atlas"], ".png": "enemy_1007_slime.png" } },
      "1008_ghost": { assetList: { ".skel": "enemy_1008_ghost.skel", ".atlas": "enemy_1008_ghost.atlas", ".png": "enemy_1008_ghost.png" } },
    },
  }
  const files = memoryFiles({ [`${workspace.root}/${MODELS_DATA}`]: JSON.stringify(data) })

  test("enemy Spine from models_data.json", async () => {
    const { locate } = await locator(arkModelsSource(), workspace, files)
    const hit = await locate("spine:enemy/enemy_1007_slime")
    expect(filesOf(workspace, hit)).toEqual([
      "skel:enemy_1007_slime.skel:models_enemies/1007_slime/enemy_1007_slime.skel",
      "atlas:enemy_1007_slime.atlas:models_enemies/1007_slime/enemy_1007_slime.atlas>atlas",
      "page:enemy_1007_slime.png:models_enemies/1007_slime/enemy_1007_slime.png",
    ])
    expect(hit?.premultipliedAlpha).toBe(true)
  })

  test("a summon that is an enemy takes the enemy Spine as its front pose", async () => {
    const { locate } = await locator(arkModelsSource(), workspace, files)
    expect(filesOf(workspace, await locate("spine:token/enemy_1007_slime/front"))).toEqual([
      "skel:enemy_1007_slime.skel:models_enemies/1007_slime/enemy_1007_slime.skel",
      "atlas:enemy_1007_slime.atlas:models_enemies/1007_slime/enemy_1007_slime.atlas>atlas",
      "page:enemy_1007_slime.png:models_enemies/1007_slime/enemy_1007_slime.png",
    ])
    expect(await locate("spine:token/enemy_1007_slime/back")).toBeNull()
    expect(await locate("spine:token/token_10020_ling_soul3/front")).toBeNull()
  })

  test("misses", async () => {
    const { locate } = await locator(arkModelsSource(), workspace, files)
    expect(await locate("spine:enemy/enemy_1008_ghost")).toBeNull()
    expect(await locate("spine:enemy/enemy_9999_none")).toBeNull()
    expect(await locate("spine:char/char_002_amiya/front")).toBeNull()
  })

  test("models_data.json needs a data object", () => {
    expect(() => parseModelsData({})).toThrow(/data/)
    expect(parseModelsData({ data: {} }).storage).toBe("models_enemies")
  })
})

describe("arknights-assets", () => {
  const ui = "assets/dyn/ui/autochess/[uc]autochesscommon/arts"
  const workspace = new MemoryWorkspace(ARKNIGHTS_ASSETS_REPO, [
    "assets/dyn/arts/profession_hub/icon_caster.png",
    "assets/dyn/arts/ui/subprofessionicon/sub_physician_icon.png",
    `${ui}/bandicon/icon_shield.png`,
    `${ui}/bondicon/icon_abyssal.png`,
    "assets/dyn/arts/rarity_hub/rarity_white_5.png",
  ])
  const table = parsePathTable({ "image:rank/rarity/5": "assets/dyn/arts/rarity_hub/rarity_white_5.png", "image:rank/rarity/6": "assets/dyn/arts/rarity_hub/rarity_white_6.png" }, "test")

  test("path table first, then rules", async () => {
    const { locate } = await locator(arknightsAssetsSource(table), workspace)
    expect(filesOf(workspace, await locate("image:rank/rarity/5"))).toEqual(["main:-:assets/dyn/arts/rarity_hub/rarity_white_5.png"])
    expect(filesOf(workspace, await locate("image:prof/caster"))).toEqual(["main:-:assets/dyn/arts/profession_hub/icon_caster.png"])
    expect(filesOf(workspace, await locate("image:prof/sub/physician"))).toEqual(["main:-:assets/dyn/arts/ui/subprofessionicon/sub_physician_icon.png"])
    expect(filesOf(workspace, await locate("image:band/band_shield"))).toEqual([`main:-:${ui}/bandicon/icon_shield.png`])
    expect(filesOf(workspace, await locate("image:bond/ABYSSAL"))).toEqual([`main:-:${ui}/bondicon/icon_abyssal.png`])
  })

  test("misses", async () => {
    const { locate } = await locator(arknightsAssetsSource(table), workspace)
    expect(await locate("image:rank/rarity/6")).toBeNull()
    expect(await locate("image:prof/pioneer")).toBeNull()
    expect(await locate("image:ui/autochess/none")).toBeNull()
    expect(await locate("audio:bgm/x")).toBeNull()
  })
})

describe("voice", () => {
  const workspace = new MemoryWorkspace(VOICE_REPO, [
    `${SOUND_ROOT}/voice_cn/char_002_amiya/cn_001.mp3`,
    `${SOUND_ROOT}/voice/char_002_amiya/cn_001.mp3`,
    `${SOUND_ROOT}/music/sys/m_sys_title.mp3`,
    `${SOUND_ROOT}/music/a/m_dup.mp3`,
    `${SOUND_ROOT}/music/b/m_dup.mp3`,
    `${SOUND_ROOT}/battle/b_hit.mp3`,
    `${SOUND_ROOT}/voice_cn/char_002_amiya/b_hit.mp3`,
    `${SOUND_ROOT}/general/g_ui/g_ui_click.mp3`,
    `${SOUND_ROOT}/customse/act1/listed.mp3`,
  ])
  const table = parsePathTable({ "audio:sfx/autochess/listed": `${SOUND_ROOT}/customse/act1/listed.mp3` }, "test")

  test("voice rules, path table and lookups by name", async () => {
    const { locate, ambiguous } = await locator(voiceSource(table), workspace)
    expect(filesOf(workspace, await locate("audio:voice/cn/char_002_amiya/CN_001"))).toEqual([`main:-:${SOUND_ROOT}/voice_cn/char_002_amiya/cn_001.mp3`])
    expect(filesOf(workspace, await locate("audio:voice/jp/char_002_amiya/CN_001"))).toEqual([`main:-:${SOUND_ROOT}/voice/char_002_amiya/cn_001.mp3`])
    expect(filesOf(workspace, await locate("audio:bgm/m_sys_title"))).toEqual([`main:-:${SOUND_ROOT}/music/sys/m_sys_title.mp3`])
    expect(filesOf(workspace, await locate("audio:sfx/battle/b_hit"))).toEqual([`main:-:${SOUND_ROOT}/battle/b_hit.mp3`])
    expect(filesOf(workspace, await locate("audio:sfx/ui/g_ui_click"))).toEqual([`main:-:${SOUND_ROOT}/general/g_ui/g_ui_click.mp3`])
    expect(filesOf(workspace, await locate("audio:sfx/autochess/listed"))).toEqual([`main:-:${SOUND_ROOT}/customse/act1/listed.mp3`])
    expect(ambiguous).toEqual([])
  })

  test("misses and same-name candidates", async () => {
    const { locate, ambiguous } = await locator(voiceSource(table), workspace)
    expect(await locate("audio:voice/en/char_002_amiya/CN_001")).toBeNull()
    expect(await locate("audio:voice/xx/char_002_amiya/CN_001")).toBeNull()
    expect(await locate("audio:bgm/b_hit")).toBeNull()
    expect(await locate("audio:sfx/battle/cn_001")).toBeNull()
    expect(ambiguous).toEqual([])
    expect(await locate("audio:bgm/m_dup")).toBeNull()
    expect(ambiguous).toEqual([{ key: "audio:bgm/m_dup", candidates: [`${SOUND_ROOT}/music/a/m_dup.mp3`, `${SOUND_ROOT}/music/b/m_dup.mp3`] }])
  })
})

describe("fonts", () => {
  const workspace = new MemoryWorkspace(FONTS_REPO, ["font/Bender/BENDER.OTF", "font/Novecento-Wide-Normal-2.otf"])

  test("main file converted to WOFF2, original as fallback", async () => {
    const { locate } = await locator(fontsSource(), workspace)
    expect(filesOf(workspace, await locate("font:bender/regular"))).toEqual(["main:-:font/Bender/BENDER.OTF>woff2", "fallback:-:font/Bender/BENDER.OTF"])
    expect(filesOf(workspace, await locate("font:novecento-wide/normal"))).toHaveLength(2)
  })

  test("misses", async () => {
    const { locate } = await locator(fontsSource(), workspace)
    expect(await locate("font:bender/light")).toBeNull()
    expect(await locate("font:none/regular")).toBeNull()
  })
})

describe("gamedata", () => {
  const workspace = new MemoryWorkspace(GAMEDATA_REPO, ["zh_CN/gamedata/excel/character_table.json", "zh_CN/gamedata/levels/obt/main/level_main_00-01.json"])

  test("hits", async () => {
    const { locate } = await locator(gamedataSource(), workspace)
    expect(filesOf(workspace, await locate("json:gamedata/excel/character_table"))).toEqual(["main:-:zh_CN/gamedata/excel/character_table.json"])
    expect(filesOf(workspace, await locate("json:gamedata/levels/obt/main/level_main_00-01"))).toEqual(["main:-:zh_CN/gamedata/levels/obt/main/level_main_00-01.json"])
  })

  test("misses", async () => {
    const { locate } = await locator(gamedataSource(), workspace)
    expect(await locate("json:gamedata/excel/none_table")).toBeNull()
    expect(await locate("json:gamedata")).toBeNull()
    expect(await locate("json:board/x")).toBeNull()
  })
})

test("a git source cannot be prepared offline without a clone", async () => {
  const { context } = testContext([])
  await expect(gamedataSource().prepare(context)).rejects.toThrow(/never cloned/)
})
