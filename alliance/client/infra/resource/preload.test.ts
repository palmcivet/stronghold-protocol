import {
  type Catalog,
  type CatalogChess,
  EMPTY_CATALOG,
} from '@alliance/contract/catalog.js';
import type {
  PieceView,
  PrivateView,
  PublicView,
} from '@alliance/contract/server-message.js';
import {
  type AssetKey,
  type AssetResolver,
  createAssetResolver,
  type PackAsset,
} from 'arknights-assets-catalog';
import { describe, expect, it } from 'vitest';
import { type PreloadInput, preloadKeys } from './preload.js';

const HASH = 'aa'.repeat(32);

function image(preloadGroup: string | null = null): PackAsset {
  return {
    kind: 'image',
    files: [{ role: 'main', name: null, format: 'png', bytes: 1, hash: HASH }],
    dependsOn: [],
    fallbackId: null,
    preloadGroup,
  };
}

const ROOM_ART: AssetKey = 'image:ui/room/banner';
const MATCH_ART: AssetKey = 'image:ui/match/frame';
const RESULT_ART: AssetKey = 'image:ui/result/trophy';
const BOARD: AssetKey = 'image:board/autochess/theme';
const avatar = (charId: string): AssetKey => `image:char/avatar/${charId}`;
const portrait = (charId: string): AssetKey => `image:char/portrait/${charId}`;
const icon = (enemyId: string): AssetKey => `image:enemy/icon/${enemyId}`;

const CHARS = ['char_a', 'char_b', 'char_c', 'char_hidden'];
const ENEMIES = ['enemy_slime', 'enemy_boss', 'enemy_unused'];

function resolver(): AssetResolver {
  const assets: Record<AssetKey, PackAsset> = {
    [ROOM_ART]: image('room'),
    [MATCH_ART]: image('match'),
    [RESULT_ART]: image('results'),
    [BOARD]: image(),
  };
  for (const charId of CHARS) {
    assets[avatar(charId)] = image();
    assets[portrait(charId)] = image();
  }
  for (const enemyId of ENEMIES) {
    assets[icon(enemyId)] = image();
  }
  return createAssetResolver([
    {
      url: 'https://cdn.example/res/base/',
      manifest: {
        schemaVersion: 1,
        pack: { type: 'base', id: 'base', version: '1', contentHash: HASH },
        requires: [],
        fileRoot: 'files/',
        assets,
        refs: {
          chars: Object.fromEntries(
            CHARS.map((charId) => [
              charId,
              { avatar: avatar(charId), portrait: portrait(charId) },
            ]),
          ),
          enemies: Object.fromEntries(
            ENEMIES.map((enemyId) => [enemyId, { icon: icon(enemyId) }]),
          ),
          board: { theme: BOARD },
        },
      },
    },
  ]);
}

function chess(id: string, charId: string, visible = true): CatalogChess {
  return {
    id,
    baseId: id,
    charId,
    goldenId: null,
    golden: false,
    tier: 1,
    rarity: 3,
    profession: null,
    bondIds: [],
    visible,
    loadout: null,
  };
}

const CATALOG: Catalog = {
  ...EMPTY_CATALOG,
  chess: {
    chess_a: chess('chess_a', 'char_a'),
    chess_b: chess('chess_b', 'char_b'),
    chess_c: chess('chess_c', 'char_c'),
    chess_hidden: chess('chess_hidden', 'char_hidden', false),
  },
  waves: {
    wave_1: {
      id: 'wave_1',
      kind: 'normal',
      bossId: null,
      enemyIds: ['enemy_slime'],
    },
  },
};

const PUBLIC = {
  phase: 'PREP',
  bannedChess: ['chess_c'],
  bossId: 'enemy_boss',
} as unknown as PublicView;

const piece = (id: string): PieceView => ({ uid: 1, kind: 'chess', id });

const PRIVATE = {
  board: [piece('chess_b')],
  hand: [null, piece('chess_a')],
  temp: [null],
} as unknown as PrivateView;

const input = (extra: Partial<PreloadInput> = {}): PreloadInput => ({
  resolver: resolver(),
  catalog: CATALOG,
  public: null,
  private: null,
  ...extra,
});

describe('preload groups', () => {
  it('loads the room art and the avatars of the offered operators for the room', () => {
    expect([...preloadKeys('room', input())].sort()).toEqual(
      [ROOM_ART, avatar('char_a'), avatar('char_b'), avatar('char_c')].sort(),
    );
  });

  it('loads the map, the unbanned operators and the enemies of this match', () => {
    expect([...preloadKeys('match', input({ public: PUBLIC }))].sort()).toEqual(
      [
        MATCH_ART,
        BOARD,
        avatar('char_a'),
        portrait('char_a'),
        avatar('char_b'),
        portrait('char_b'),
        icon('enemy_slime'),
        icon('enemy_boss'),
      ].sort(),
    );
  });

  it('loads the result art and the portraits of the own operators for the results', () => {
    expect(
      [...preloadKeys('results', input({ private: PRIVATE }))].sort(),
    ).toEqual([RESULT_ART, portrait('char_a'), portrait('char_b')].sort());
  });
});
