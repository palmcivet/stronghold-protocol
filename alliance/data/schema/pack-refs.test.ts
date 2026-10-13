import { expect, test } from 'vitest';
import {
  type CueTable,
  cueTableIssues,
  mergeCueTables,
  packAppIssues,
} from '#schema/pack-app.js';
import {
  baseRefsIssues,
  isBaseRefs,
  isResourceRefs,
  isSeasonRefs,
  seasonRefsIssues,
} from '#schema/pack-refs.js';

const BASE = {
  chars: {
    char_002_amiya: {
      avatar: 'image:char/avatar/char_002_amiya',
      spine: { front: 'spine:char/char_002_amiya/front' },
    },
  },
  skins: {
    char_002_amiya_epoque_4: {
      spine: { front: 'spine:skin/char_002_amiya_epoque_4/front' },
    },
  },
  tokens: {
    token_a: {
      spine: 'spine:token/token_a/front',
      spineVariants: { token_a_x: 'spine:token/token_a/token_a_x' },
    },
  },
  voice: {
    char_002_amiya: { select: ['audio:voice/cn/char_002_amiya/cn_001'] },
  },
  sfx: { battle: { b_char_set: 'audio:sfx/battle/b_char_set' } },
  fonts: { bender: { regular: 'font:bender/regular' } },
};

const CUES = {
  ui: { click: 'audio:sfx/ui/g_ui_btn_h' },
  bond: { levelUp: 'audio:sfx/autochess/act1autochess_b_ui_buffup' },
  bgm: {
    lobby: {
      intro: 'audio:bgm/m_sys_act1autochess_intro',
      loop: 'audio:bgm/m_sys_act1autochess_loop',
    },
  },
  combat: [
    {
      rounds: { from: 1, to: 7 },
      loop: 'audio:bgm/m_bat_kazimierz2_2_loop',
    },
    { rounds: { from: 8 }, loop: 'audio:bgm/m_bat_kazimierz2_1_loop' },
  ],
  battle: { deploy: 'audio:sfx/battle/b_char_set' },
  bossBgm: { boss_1: { loop: 'audio:bgm/m_bat_ancestor_loop' } },
} as CueTable;

const SEASON = {
  bgm: { m_bat: 'audio:bgm/m_bat' },
  sfx: { autochess: { a: 'audio:sfx/autochess/a' } },
  animRoles: 'json:anim-roles/act2autochess',
  board: { theme: 'json:board/autochess/tiles' },
};

test('base and season refs pass their own guard and the merged guard', () => {
  expect(baseRefsIssues(BASE)).toEqual([]);
  expect(seasonRefsIssues(SEASON)).toEqual([]);
  expect(isBaseRefs(BASE) && isSeasonRefs(SEASON)).toBe(true);
  expect(
    isResourceRefs({ ...BASE, ...SEASON, sfx: { ...BASE.sfx, ...SEASON.sfx } }),
  ).toBe(true);
});

test('a name of the other pack kind is rejected', () => {
  expect(baseRefsIssues({ bgm: SEASON.bgm })).toEqual([
    { path: 'refs.bgm', message: 'unknown name "bgm"' },
  ]);
  expect(seasonRefsIssues({ chars: BASE.chars })).toEqual([
    { path: 'refs.chars', message: 'unknown name "chars"' },
  ]);
});

test('a cue track holds only an intro and a loop', () => {
  expect(
    cueTableIssues({ bgm: { lobby: { outro: 'audio:bgm/x' } }, voice: {} }),
  ).toEqual([
    { path: 'app.cues.bgm.lobby.outro', message: 'unknown name "outro"' },
    { path: 'app.cues.voice', message: 'unknown name "voice"' },
  ]);
});

test('a cue role must be a known role', () => {
  expect(
    cueTableIssues({
      ui: { clack: 'audio:sfx/ui/x' },
      bgm: { intro: { loop: 'audio:bgm/x' } },
    }),
  ).toEqual([
    { path: 'app.cues.ui.clack', message: 'unknown role "clack"' },
    { path: 'app.cues.bgm.intro', message: 'unknown role "intro"' },
  ]);
});

test('combat tracks need rounds from 1, in order, without overlap', () => {
  expect(
    cueTableIssues({
      combat: [
        { loop: 'audio:bgm/a' },
        { rounds: { to: 3 }, loop: 'audio:bgm/b' },
        { rounds: { from: 0 }, loop: 'audio:bgm/c' },
      ],
    }),
  ).toEqual([
    { path: 'app.cues.combat[0].rounds', message: 'missing "rounds"' },
    { path: 'app.cues.combat[1].rounds.from', message: 'missing "from"' },
    {
      path: 'app.cues.combat[2].rounds.from',
      message: 'expected a whole number from 1',
    },
  ]);
  expect(
    cueTableIssues({
      combat: [
        { rounds: { from: 1, to: 7 }, loop: 'audio:bgm/a' },
        { rounds: { from: 9, to: 3 }, loop: 'audio:bgm/b' },
        { rounds: { from: 5 }, loop: 'audio:bgm/c' },
      ],
    }),
  ).toEqual([
    { path: 'app.cues.combat[1]', message: 'rounds end before they start' },
    { path: 'app.cues.combat[2]', message: 'rounds overlap combat track 0' },
  ]);
});

test('each problem is reported with its path', () => {
  expect(
    baseRefsIssues({
      chars: {
        char_x: {
          avatar: 'image:Bad Key',
          spine: 'spine:char/char_x/front',
          extra: 'image:a',
        },
      },
      voice: { char_x: { select: 'audio:voice/cn/char_x/cn_001' } },
    }),
  ).toEqual([
    {
      path: 'refs.chars.char_x.avatar',
      message: "segment \"Bad Key\" may only use letters, digits, '_' and '-'",
    },
    { path: 'refs.chars.char_x.spine', message: 'expected an object' },
    { path: 'refs.chars.char_x.extra', message: 'unknown name "extra"' },
    { path: 'refs.voice.char_x.select', message: 'expected an array of keys' },
  ]);
  expect(seasonRefsIssues(null)).toEqual([
    { path: 'refs', message: 'expected an object' },
  ]);
});

test('a cue table lives in the app section, not in refs', () => {
  expect(packAppIssues({ cues: CUES })).toEqual([]);
  expect(seasonRefsIssues({ ...SEASON, cues: CUES })).toEqual([
    { path: 'refs.cues', message: 'unknown name "cues"' },
  ]);
  expect(packAppIssues({ cues: CUES, extra: {} })).toEqual([
    { path: 'app.extra', message: 'unknown name "extra"' },
  ]);
  expect(cueTableIssues({ ui: { click: 'image:ui/x' } })).toEqual([
    { path: 'app.cues.ui.click', message: 'image:ui/x is not audio' },
  ]);
});

test('cue tables merge by role and track, with a later combat list replacing the earlier one', () => {
  expect(
    mergeCueTables([
      CUES,
      {
        ui: { tab: 'audio:sfx/ui/g_ui_tabswitch' },
        combat: [{ rounds: { from: 1 }, loop: 'audio:bgm/m_bat_x_loop' }],
      },
    ]),
  ).toEqual({
    ...CUES,
    ui: { ...CUES.ui, tab: 'audio:sfx/ui/g_ui_tabswitch' },
    combat: [{ rounds: { from: 1 }, loop: 'audio:bgm/m_bat_x_loop' }],
  });
});
