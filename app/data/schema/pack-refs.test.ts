import { expect, test } from "vitest"
import { baseRefsIssues, isBaseRefs, isResourceRefs, isSeasonRefs, seasonRefsIssues } from "#schema/pack-refs.js"

const BASE = {
  chars: { char_002_amiya: { avatar: "image:char/avatar/char_002_amiya", spine: { front: "spine:char/char_002_amiya/front" } } },
  skins: { char_002_amiya_epoque_4: { spine: { front: "spine:skin/char_002_amiya_epoque_4/front" } } },
  tokens: { token_a: { spine: "spine:token/token_a/front", spineVariants: { token_a_x: "spine:token/token_a/token_a_x" } } },
  voice: { char_002_amiya: { select: ["audio:voice/cn/char_002_amiya/cn_001"] } },
  sfx: { battle: { b_char_set: "audio:sfx/battle/b_char_set" } },
  fonts: { bender: { regular: "font:bender/regular" } },
}

const SEASON = {
  bgm: { m_bat: "audio:bgm/m_bat" },
  sfx: { autochess: { a: "audio:sfx/autochess/a" } },
  animRoles: "json:anim-roles/act2autochess",
  board: { theme: "json:board/autochess/tiles" },
}

test("base and season refs pass their own guard and the merged guard", () => {
  expect(baseRefsIssues(BASE)).toEqual([])
  expect(seasonRefsIssues(SEASON)).toEqual([])
  expect(isBaseRefs(BASE) && isSeasonRefs(SEASON)).toBe(true)
  expect(isResourceRefs({ ...BASE, ...SEASON, sfx: { ...BASE.sfx, ...SEASON.sfx } })).toBe(true)
})

test("a name of the other pack kind is rejected", () => {
  expect(baseRefsIssues({ bgm: SEASON.bgm })).toEqual([{ path: "refs.bgm", message: 'unknown name "bgm"' }])
  expect(seasonRefsIssues({ chars: BASE.chars })).toEqual([{ path: "refs.chars", message: 'unknown name "chars"' }])
})

test("each problem is reported with its path", () => {
  expect(
    baseRefsIssues({
      chars: { char_x: { avatar: "image:Bad Key", spine: "spine:char/char_x/front", extra: "image:a" } },
      voice: { char_x: { select: "audio:voice/cn/char_x/cn_001" } },
    }),
  ).toEqual([
    { path: "refs.chars.char_x.avatar", message: "segment \"Bad Key\" may only use letters, digits, '_' and '-'" },
    { path: "refs.chars.char_x.spine", message: "expected an object" },
    { path: "refs.chars.char_x.extra", message: 'unknown name "extra"' },
    { path: "refs.voice.char_x.select", message: "expected an array of keys" },
  ])
  expect(seasonRefsIssues(null)).toEqual([{ path: "refs", message: "expected an object" }])
})
