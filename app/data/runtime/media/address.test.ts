import { validSpine, type SpineFile } from "arknights-assets-catalog"
import { expect, test } from "vitest"
import {
  artUrls,
  avatarUrl,
  bandIconUrl,
  baseCharId,
  bgmEntry,
  bondIconUrl,
  enemyIconUrl,
  hasBackSpine,
  itemIconUrl,
  portraitUrl,
  profIconUrl,
  sfxUrl,
  skillIconUrl,
  spineEntry,
  subProfIconUrl,
  tokenAvatarUrl,
  uiUrl,
  unitPictureUrl,
  unitSfxUrl,
} from "#runtime/media/address.js"

function spineFile(id: string, extra: Partial<SpineFile> = {}): SpineFile {
  return {
    skel: `/assets/spine/${id}.skel`,
    atlas: `/assets/spine/${id}.atlas`,
    textures: [`/assets/spine/${id}.png`],
    pma: false,
    anims: { idle: "Idle", attack: { loop: "Attack" } },
    ...extra,
  }
}

const manifest = {
  chars: {
    char_002_amiya: {
      avatar: "/a/amiya.png",
      avatarE2: "/a/amiya_2.png",
      portrait: "/p/amiya_1.png",
      portraitE2: "/p/amiya_2.png",
      spine: { front: spineFile("amiya_f"), back: spineFile("amiya_b") },
    },
    char_010_chen: { avatar: "/a/chen.png", portrait: "/p/chen_1.png", spine: { front: spineFile("chen_f") } },
  },
  enemies: {
    enemy_1007_slime: { icon: "/e/slime.png", spine: spineFile("slime", { pma: true }) },
    enemy_1305_mhslim: { icon: "/e/mh.png", spineAliasOf: "enemy_1007_slime" },
    enemy_9016_acstmr: { icon: "/e/acstmr.png" },
  },
  tokens: {
    token_a: { owner: "char_010_chen", avatar: "/t/a.png", spine: spineFile("tok_a") },
    token_b: { owner: "char_010_chen" },
    token_c: { owner: null },
  },
  bonds: { yanShip: "/b/yan.png" },
  bands: { band_bldsk: "/band/bldsk.png" },
  items: { trap_1041_acarm041: "/i/1041.png" },
  skills: { skchr_x: "/s/x.png" },
  skillsById: { skill_y: "skchr_x" },
  ui: { "skillIcon/empty": "/ui/empty.png", "battle/sprite_shadow": "/ui/shadow.png" },
  prof: { icon: { sniper: "/prof/sniper.png" }, battlecard: { token: "/prof/token.png" }, sub: { fastshot: "/prof/sub/fastshot.png" } },
  audio: {
    bgm: { prep: { loop: "/bgm/prep.mp3" }, lobby: { intro: "/bgm/i.mp3", loop: "/bgm/l.mp3" } },
    bossBgm: { boss_1: { loop: "/bgm/b1.mp3" } },
    sfx: {
      ui: { buy: "/sfx/buy.mp3" },
      battle: { deploy: "/sfx/dep.mp3" },
      units: { char_010_chen: { attack: "/sfx/c_atk.mp3", skills: { 2: "/sfx/c_s3.mp3" }, skill: "/sfx/c_s.mp3" } },
    },
  },
}

test("avatars and portraits with elite art", () => {
  expect(avatarUrl(manifest, "char_002_amiya")).toBe("/a/amiya.png")
  expect(avatarUrl(manifest, "char_002_amiya", true)).toBe("/a/amiya_2.png")
  expect(avatarUrl(manifest, "char_002_amiya_2")).toBe("/a/amiya_2.png")
  expect(avatarUrl(manifest, "char_010_chen", true)).toBe("/a/chen.png")
  expect(avatarUrl(manifest, "char_010_chen_2")).toBe("/a/chen.png")
  expect(avatarUrl(manifest, "char_999_none")).toBeNull()
  expect(avatarUrl(manifest, "")).toBeNull()
  expect(avatarUrl(manifest, 42 as unknown as string)).toBeNull()
  expect(avatarUrl(null, "char_002_amiya")).toBeNull()
  expect(portraitUrl(manifest, "char_002_amiya_1")).toBe("/p/amiya_1.png")
  expect(portraitUrl(manifest, "char_002_amiya_2")).toBe("/p/amiya_2.png")
  expect(portraitUrl(manifest, "char_010_chen", true)).toBe("/p/chen_1.png")
  expect(baseCharId("char_002_amiya_2")).toBe("char_002_amiya")
  expect(baseCharId(null as unknown as string)).toBeNull()
})

test("prototype keys never resolve", () => {
  expect(avatarUrl(manifest, "__proto__")).toBeNull()
  expect(avatarUrl(manifest, "constructor")).toBeNull()
  expect(uiUrl(manifest, "toString")).toBeNull()
  expect(spineEntry(manifest, "hasOwnProperty")).toBeNull()
})

test("enemy, token, bond, band, item, skill, ui and profession icons", () => {
  expect(enemyIconUrl(manifest, "enemy_1007_slime")).toBe("/e/slime.png")
  expect(enemyIconUrl(manifest, "enemy_x")).toBeNull()
  expect(tokenAvatarUrl(manifest, "token_a")).toBe("/t/a.png")
  expect(tokenAvatarUrl(manifest, "token_b")).toBe("/a/chen.png")
  expect(tokenAvatarUrl(manifest, "token_c")).toBe("/prof/token.png")
  expect(tokenAvatarUrl(manifest, "token_none")).toBeNull()
  expect(bondIconUrl(manifest, "yanShip")).toBe("/b/yan.png")
  expect(bandIconUrl(manifest, "band_bldsk")).toBe("/band/bldsk.png")
  expect(itemIconUrl(manifest, "trap_1041_acarm041")).toBe("/i/1041.png")
  expect(itemIconUrl(manifest, { trapId: "trap_1041_acarm041" })).toBe("/i/1041.png")
  expect(itemIconUrl(manifest, { iconId: "nope", trapId: "trap_1041_acarm041" })).toBeNull()
  expect(skillIconUrl(manifest, "skchr_x")).toBe("/s/x.png")
  expect(skillIconUrl(manifest, "skill_y")).toBe("/s/x.png")
  expect(skillIconUrl(manifest, "nope")).toBe("/ui/empty.png")
  expect(skillIconUrl(manifest, "nope", false)).toBeNull()
  expect(spineEntry(manifest, "char_002_amiya")?.skel).toBe("/assets/spine/amiya_f.skel")
  expect(uiUrl(manifest, "battle/sprite_shadow")).toBe("/ui/shadow.png")
  expect(profIconUrl(manifest, "SNIPER")).toBe("/prof/sniper.png")
  expect(profIconUrl(manifest, "SNIPER", "large")).toBeNull()
  expect(subProfIconUrl(manifest, "sub_fastshot_icon")).toBe("/prof/sub/fastshot.png")
  expect(subProfIconUrl(manifest, "fastshot")).toBe("/prof/sub/fastshot.png")
})

test("spine entries cover front, back, tokens, enemies and aliases", () => {
  expect(spineEntry(manifest, "char_002_amiya")?.skel).toBe("/assets/spine/amiya_f.skel")
  expect(spineEntry(manifest, "char_002_amiya", true)?.skel).toBe("/assets/spine/amiya_b.skel")
  expect(spineEntry(manifest, "char_010_chen", true)?.skel).toBe("/assets/spine/chen_f.skel")
  expect(spineEntry(manifest, "char_002_amiya_2")?.skel).toBe("/assets/spine/amiya_f.skel")
  expect(hasBackSpine(manifest, "char_002_amiya")).toBe(true)
  expect(hasBackSpine(manifest, "char_010_chen")).toBe(false)
  expect(spineEntry(manifest, "token_a")?.skel).toBe("/assets/spine/tok_a.skel")
  expect(spineEntry(manifest, "token_b")).toBeNull()
  expect(spineEntry(manifest, "enemy_1007_slime")?.pma).toBe(true)
  expect(spineEntry(manifest, "enemy_1305_mhslim")?.skel).toBe("/assets/spine/slime.skel")
  expect(spineEntry(manifest, "enemy_9016_acstmr")).toBeNull()
  expect(spineEntry(manifest, "enemy_5601_entlec")).toBeNull()
  expect(validSpine({ skel: "javascript:alert(1).skel", atlas: "x", anims: {} })).toBe(false)
  expect(validSpine({ skel: "/x.skel", atlas: "/x.atlas", anims: {} })).toBe(true)
  expect(unitPictureUrl(manifest, "enemy_9016_acstmr")).toBe("/e/acstmr.png")
  expect(unitPictureUrl(manifest, "trap_1041_acarm041")).toBe("/i/1041.png")
  expect(unitPictureUrl(manifest, "trap_x")).toBeNull()
})

test("bgm and unit sfx addresses", () => {
  expect(bgmEntry(manifest, "prep")?.loop).toBe("/bgm/prep.mp3")
  expect(bgmEntry(manifest, "boss_1")?.loop).toBe("/bgm/b1.mp3")
  expect(bgmEntry(manifest, "x")).toBeNull()
  expect(sfxUrl(manifest, "ui", "buy")).toBe("/sfx/buy.mp3")
  expect(sfxUrl(manifest, "ui", "nope")).toBeNull()
  expect(unitSfxUrl(manifest, "char_010_chen", "attack")).toBe("/sfx/c_atk.mp3")
  expect(unitSfxUrl(manifest, "char_010_chen", "skill", 2)).toBe("/sfx/c_s3.mp3")
  expect(unitSfxUrl(manifest, "char_010_chen", "skill", 0)).toBe("/sfx/c_s.mp3")
  expect(unitSfxUrl(manifest, "char_010_chen_2", "attack")).toBe("/sfx/c_atk.mp3")
  expect(unitSfxUrl(manifest, "nobody", "attack")).toBeNull()
})

test("enemy icon and local art prefer the season manifest", () => {
  const season = {
    enemies: { enemy_a_2: {}, enemy_a: { icon: "/assets/enemy/icon/enemy_a.png" } },
    ui: { "guide/page": "/assets/ui/guide/page.png" },
  }
  expect(enemyIconUrl(season, "enemy_a_2")).toBe("/assets/enemy/icon/enemy_a.png")
  const urls = artUrls({ groups: { guide: { page: { path: "/assets/local/guide/page.png" } } } }, season, "guide", "page")
  expect(urls).toEqual(["/assets/local/guide/page.png", "/assets/ui/guide/page.png"])
})
