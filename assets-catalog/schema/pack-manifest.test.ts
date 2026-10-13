import { describe, expect, test } from 'vitest';
import {
  isPackManifest,
  packManifestIssues,
  packRefsIssues,
} from '#schema/pack-manifest.js';

const HASH = '5b'.repeat(32);

const BASE = {
  schemaVersion: 1,
  pack: { type: 'base', id: 'base', version: '1.0.0-r1', contentHash: HASH },
  requires: [],
  fileRoot: '../../../files/',
  assets: {
    'image:char/avatar/char_002_amiya': {
      kind: 'image',
      files: [
        { role: 'main', name: null, format: 'png', bytes: 20817, hash: HASH },
      ],
      dependsOn: [],
      fallbackId: null,
      preloadGroup: 'shop',
    },
    'image:char/avatar/char_002_amiya_2': {
      kind: 'image',
      files: [
        { role: 'main', name: null, format: 'png', bytes: 20817, hash: HASH },
      ],
      dependsOn: [],
      fallbackId: 'image:char/avatar/char_002_amiya',
      preloadGroup: 'shop',
    },
  },
  refs: {
    chars: {
      char_002_amiya: {
        avatar: 'image:char/avatar/char_002_amiya',
        avatarElite: 'image:char/avatar/char_002_amiya_2',
        spine: 'spine:char/char_002_amiya/front',
      },
    },
    enemies: { enemy_1305_mhslim: { spine: 'spine:enemy/enemy_1305_mhslim' } },
    voices: [
      'audio:voice/cn/char_002_amiya/CN_001',
      'audio:voice/cn/char_002_amiya/CN_002',
    ],
  },
};

describe('pack manifest guard', () => {
  test('the base sample passes', () => {
    expect(packManifestIssues(BASE)).toEqual([]);
    expect(isPackManifest(BASE)).toBe(true);
  });

  test('an upstream overlay may point files elsewhere and leave the hash empty', () => {
    const upstream = {
      ...BASE,
      pack: {
        type: 'upstream',
        id: 'backend',
        version: '0.2.9',
        contentHash: HASH,
      },
      fileRoot: 'https://upstream.example/',
      assets: {
        'audio:bgm/m_bat_autochess_loop': {
          kind: 'audio',
          files: [
            {
              role: 'main',
              name: null,
              format: 'mp3',
              bytes: 0,
              hash: '',
              href: 'media/bgm/m_bat_autochess_loop',
            },
          ],
          dependsOn: [],
          fallbackId: null,
          preloadGroup: null,
        },
      },
    };
    expect(packManifestIssues(upstream)).toEqual([]);
    const noHref = {
      ...upstream,
      assets: {
        'audio:a': {
          ...upstream.assets['audio:bgm/m_bat_autochess_loop'],
          files: [
            { role: 'main', name: null, format: 'mp3', bytes: 0, hash: '' },
          ],
        },
      },
    };
    expect(packManifestIssues(noHref)).toEqual([
      {
        path: 'assets["audio:a"].files[0].hash',
        message: 'expected a lowercase hex SHA-256',
      },
    ]);
  });

  test('an image or texture may name its colour space; other kinds may not', () => {
    const image = BASE.assets['image:char/avatar/char_002_amiya'];
    const audio = {
      kind: 'audio',
      files: [
        { role: 'main', name: null, format: 'mp3', bytes: 1, hash: HASH },
      ],
      dependsOn: [],
      fallbackId: null,
      preloadGroup: null,
    };
    const withAssets = (assets: Record<string, unknown>) => ({
      ...BASE,
      assets,
      refs: undefined,
    });
    expect(
      packManifestIssues(
        withAssets({
          'image:board/normal': { ...image, colorSpace: 'linear' },
        }),
      ),
    ).toEqual([]);
    expect(
      packManifestIssues(
        withAssets({ 'image:board/normal': { ...image, colorSpace: 'rgb' } }),
      ),
    ).toEqual([
      {
        path: 'assets["image:board/normal"].colorSpace',
        message: 'expected one of "srgb", "linear"',
      },
    ]);
    expect(
      packManifestIssues(
        withAssets({ 'audio:a': { ...audio, colorSpace: 'srgb' } }),
      ),
    ).toEqual([
      {
        path: 'assets["audio:a"].colorSpace',
        message: '"audio" assets have no colour space',
      },
    ]);
  });

  test('an image may carry a variant label; other kinds and empty labels fail', () => {
    const image = BASE.assets['image:char/avatar/char_002_amiya_2'];
    const audio = {
      kind: 'audio',
      files: [
        { role: 'main', name: null, format: 'mp3', bytes: 1, hash: HASH },
      ],
      dependsOn: [],
      fallbackId: null,
      preloadGroup: null,
    };
    const withAssets = (assets: Record<string, unknown>) => ({
      ...BASE,
      assets,
      refs: undefined,
    });
    expect(
      packManifestIssues(
        withAssets({ 'image:char/avatar/x': { ...image, label: 'elite2' } }),
      ),
    ).toEqual([]);
    expect(
      packManifestIssues(withAssets({ 'image:char/avatar/x': image })),
    ).toEqual([]);
    expect(
      packManifestIssues(
        withAssets({
          'image:char/avatar/x': { ...image, label: '' },
          'audio:a': { ...audio, label: 'skin' },
        }),
      ),
    ).toEqual([
      {
        path: 'assets["image:char/avatar/x"].label',
        message: 'expected a non-empty string',
      },
      {
        path: 'assets["audio:a"].label',
        message: '"audio" assets take no label',
      },
    ]);
  });

  test('header fields', () => {
    expect(
      packManifestIssues({
        ...BASE,
        schemaVersion: '1',
        pack: { type: '', id: '', version: '', contentHash: 'x' },
        requires: [{ type: '', id: 'base', version: 1 }],
        fileRoot: '../files',
      }),
    ).toEqual([
      { path: 'schemaVersion', message: 'expected one of 1' },
      { path: 'pack.type', message: 'expected a non-empty string' },
      { path: 'pack.id', message: 'expected a non-empty string' },
      { path: 'pack.version', message: 'expected a non-empty string' },
      { path: 'pack.contentHash', message: 'expected a lowercase hex SHA-256' },
      { path: 'requires[0].type', message: 'expected a non-empty string' },
      { path: 'requires[0].version', message: 'expected a non-empty string' },
      { path: 'fileRoot', message: "expected a trailing '/'" },
    ]);
  });

  test('pack types are any non-empty string named by the pack author', () => {
    expect(
      packManifestIssues({
        ...BASE,
        pack: { ...BASE.pack, type: 'theme' },
        requires: [{ type: 'mod', id: 'boss-bgm', version: '1' }],
      }),
    ).toEqual([]);
    expect(
      packManifestIssues({
        ...BASE,
        pack: { ...BASE.pack, type: 7 },
        requires: [{ type: null, id: 'base', version: '1' }],
      }),
    ).toEqual([
      { path: 'pack.type', message: 'expected a non-empty string' },
      { path: 'requires[0].type', message: 'expected a non-empty string' },
    ]);
  });

  test('asset entries', () => {
    const asset = BASE.assets['image:char/avatar/char_002_amiya'];
    expect(
      packManifestIssues({
        ...BASE,
        refs: undefined,
        assets: {
          'image:a': { ...asset, fallbackId: 'image:a' },
          'image:b': { ...asset, fallbackId: 'image:b.png', preloadGroup: '' },
          'spine:c': { ...asset, kind: 'image' },
          'image:d': { ...asset, dependsOn: 'image:a' },
        },
      }),
    ).toEqual([
      {
        path: 'assets["image:a"].fallbackId',
        message: 'an asset cannot fall back to itself',
      },
      {
        path: 'assets["image:b"].fallbackId',
        message:
          "invalid asset key: segment \"b.png\" may only use letters, digits, '_' and '-'",
      },
      {
        path: 'assets["image:b"].preloadGroup',
        message: 'expected a non-empty string',
      },
      {
        path: 'assets["spine:c"].kind',
        message: 'expected "spine" to match the key',
      },
      {
        path: 'assets["spine:c"].files[0].name',
        message: "expected a file name of letters, digits, '_', '-' and '.'",
      },
      {
        path: 'assets["spine:c"].files[0]',
        message: 'a spine entry does not take a main file in png',
      },
      { path: 'assets["image:d"].dependsOn', message: 'expected an array' },
    ]);
  });
});

describe('refs leaves', () => {
  test('every leaf must be a key', () => {
    expect(packRefsIssues(BASE.refs)).toEqual([]);
    expect(
      packRefsIssues({
        chars: {
          char_002_amiya: {
            avatar: '/assets/avatar/char_002_amiya.png',
            spine: null,
            elite: 2,
          },
        },
        voices: ['audio:voice/cn/a/CN_001', 'voice.mp3'],
        board: { theme: 'json:board/autochess/tiles' },
      }),
    ).toEqual([
      {
        path: 'refs.chars.char_002_amiya.avatar',
        message: "invalid asset key: missing ':' between kind and path",
      },
      {
        path: 'refs.chars.char_002_amiya.spine',
        message: 'invalid asset key: not a string',
      },
      {
        path: 'refs.chars.char_002_amiya.elite',
        message: 'invalid asset key: not a string',
      },
      {
        path: 'refs.voices[1]',
        message: "invalid asset key: missing ':' between kind and path",
      },
    ]);
    expect(packRefsIssues(['image:a'])).toEqual([
      { path: 'refs', message: 'expected an object' },
    ]);
  });

  test('the manifest guard checks refs', () => {
    expect(
      packManifestIssues({
        ...BASE,
        refs: { ui: { icon: 'image:ui/autochess/icon.png' } },
      }),
    ).toEqual([
      {
        path: 'refs.ui.icon',
        message:
          "invalid asset key: segment \"icon.png\" may only use letters, digits, '_' and '-'",
      },
    ]);
    const { refs: _refs, ...withoutRefs } = BASE;
    expect(isPackManifest(withoutRefs)).toBe(true);
  });
});
