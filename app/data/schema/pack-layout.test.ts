import {
  AssetAddressError,
  type PackManifest,
  packManifestIssues,
} from 'arknights-assets-catalog';
import { describe, expect, test } from 'vitest';
import {
  emptyLocalManifest,
  needsListIssuesWithPackTypes,
  type PublishedPack,
  packDirectory,
  packFileRoot,
  packManifestAddress,
  packTypeIssues,
  RESOURCE_ROOT,
} from '#schema/pack-layout.js';

const HASH = 'a7'.repeat(32);
const ORIGIN = 'https://cdn.example';

const PACKS: readonly [PublishedPack, string][] = [
  [
    { type: 'base', id: 'base', version: '1.0.0-r2', contentHash: HASH },
    `packs/base/1.0.0-r2/`,
  ],
  [
    {
      type: 'season',
      id: 'act2autochess',
      version: '2026.10.09',
      contentHash: HASH,
    },
    `packs/season/act2autochess/${HASH}/`,
  ],
  [
    { type: 'mod', id: 'boss-bgm', version: '0.3.1', contentHash: HASH },
    `packs/mod/boss-bgm/0.3.1/`,
  ],
  [{ type: 'local', id: 'local', version: '0', contentHash: HASH }, `local/`],
];

function packAt(index: number): PublishedPack {
  const entry = PACKS[index];
  if (!entry) {
    throw new Error(`no pack at index ${index}`);
  }
  return entry[0];
}

describe('published pack layout', () => {
  test.each(PACKS)('%j lives in %s', (pack, directory) => {
    expect(packDirectory(pack)).toBe(directory);
    expect(packManifestAddress(pack)).toBe(`${directory}manifest.json`);
  });

  test.each(PACKS)(
    'fileRoot of %j points at the shared files directory',
    (pack) => {
      const manifestUrl = new URL(
        `${RESOURCE_ROOT}${packManifestAddress(pack)}`,
        ORIGIN,
      );
      expect(new URL(packFileRoot(pack), manifestUrl).toString()).toBe(
        `${ORIGIN}/res/files/`,
      );
    },
  );

  test('season and base roots', () => {
    expect(packFileRoot(packAt(0))).toBe('../../../files/');
    expect(packFileRoot(packAt(1))).toBe('../../../../files/');
    expect(packFileRoot(packAt(3))).toBe('../files/');
  });

  test('ids and versions must be single path segments', () => {
    expect(() =>
      packDirectory({
        type: 'mod',
        id: '../x',
        version: '1',
        contentHash: HASH,
      }),
    ).toThrow(AssetAddressError);
    expect(() =>
      packDirectory({
        type: 'base',
        id: 'base',
        version: '..',
        contentHash: HASH,
      }),
    ).toThrow(AssetAddressError);
    expect(() =>
      packDirectory({
        type: 'season',
        id: 'a b',
        version: '1',
        contentHash: HASH,
      }),
    ).toThrow(AssetAddressError);
  });
});

describe('pack types', () => {
  const manifest = (
    type: string,
    requires: readonly string[],
  ): PackManifest => ({
    schemaVersion: 1,
    pack: { type, id: 'x', version: '1', contentHash: HASH },
    requires: requires.map((requirement) => ({
      type: requirement,
      id: 'base',
      version: '1',
    })),
    fileRoot: '../files/',
    assets: {},
  });

  test('the five overlay types pass; only base and season may be required', () => {
    for (const type of ['base', 'season', 'mod', 'local', 'upstream']) {
      expect(packTypeIssues(manifest(type, ['base', 'season']))).toEqual([]);
    }
  });

  test('other types are rejected', () => {
    expect(packTypeIssues(manifest('theme', ['base', 'mod']))).toEqual([
      {
        path: 'pack.type',
        message: 'expected one of "base", "season", "mod", "local", "upstream"',
      },
      { path: 'requires[1].type', message: 'expected one of "base", "season"' },
    ]);
  });
});

describe('empty local manifest', () => {
  test('passes the pack manifest guard and resolves its file root beside /res/files/', () => {
    const manifest = emptyLocalManifest();
    expect(packManifestIssues(manifest)).toEqual([]);
    expect(packTypeIssues(manifest)).toEqual([]);
    expect(manifest.pack.type).toBe('local');
    expect(manifest.assets).toEqual({});
    expect(
      new URL(manifest.fileRoot, 'https://cdn.example/res/local/manifest.json')
        .pathname,
    ).toBe('/res/files/');
  });
});

describe('needs list pack types', () => {
  const list = {
    schemaVersion: 1,
    pack: { type: 'season', id: 'act2autochess' },
    needs: [{ key: 'image:a', required: true }],
  };

  test('base and season pass', () => {
    expect(needsListIssuesWithPackTypes(list)).toEqual([]);
    expect(
      needsListIssuesWithPackTypes({
        ...list,
        pack: { type: 'base', id: 'base' },
      }),
    ).toEqual([]);
  });

  test("other types are rejected in place of the catalog's own pack.type issue", () => {
    expect(
      needsListIssuesWithPackTypes({ ...list, pack: { type: 'mod', id: 'x' } }),
    ).toEqual([
      { path: 'pack.type', message: 'expected one of "base", "season"' },
    ]);
    expect(
      needsListIssuesWithPackTypes({
        ...list,
        schemaVersion: 2,
        pack: { type: '', id: '' },
      }),
    ).toEqual([
      { path: 'schemaVersion', message: 'expected one of 1' },
      { path: 'pack.type', message: 'expected one of "base", "season"' },
      { path: 'pack.id', message: 'expected a non-empty string' },
    ]);
  });

  test("a list without a pack object keeps the catalog's issues", () => {
    expect(needsListIssuesWithPackTypes({ ...list, pack: null })).toEqual([
      { path: 'pack', message: 'expected an object' },
    ]);
    expect(needsListIssuesWithPackTypes(null)).toEqual([
      { path: '$', message: 'expected an object' },
    ]);
  });
});
