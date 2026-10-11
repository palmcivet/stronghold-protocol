import { describe, expect, test } from 'vitest';
import { AssetAddressError } from '#address/file.js';
import {
  type PublishedPack,
  packDirectory,
  packFileRoot,
  packManifestAddress,
  RESOURCE_ROOT,
} from '#address/pack.js';

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
