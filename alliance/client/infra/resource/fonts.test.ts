import type { AssetLayer } from 'arknights-assets-catalog';
import { describe, expect, it } from 'vitest';
import { fontStylesheetHrefs } from './fonts.js';

function layer(url: string, keys: readonly string[]): AssetLayer {
  return {
    url,
    manifest: {
      assets: Object.fromEntries(keys.map((key) => [key, { kind: 'font' }])),
    },
  } as unknown as AssetLayer;
}

describe('fontStylesheetHrefs', () => {
  it('is empty when no layer publishes a font', () => {
    expect(
      fontStylesheetHrefs([
        layer('https://cdn.example/res/packs/base/1/manifest.json', [
          'image:ui/mark',
        ]),
      ]),
    ).toEqual([]);
  });

  it('points a base pack at fonts.css beside the manifest and a master backend at /fonts/fonts.css', () => {
    expect(
      fontStylesheetHrefs(
        [
          layer('https://cdn.example/res/packs/base/1/manifest.json', [
            'font:bender/regular',
          ]),
          layer('https://game.example/data/assets.json', [
            'font:novecento-wide/normal',
          ]),
        ],
        'https://game.example/',
      ),
    ).toEqual([
      'https://cdn.example/res/packs/base/1/fonts.css',
      'https://game.example/fonts/fonts.css',
    ]);
  });
});
