import type { AssetKey } from 'arknights-assets-catalog';
import { expect, test } from 'vitest';
import { imageVariantLabel } from '#catalog/variant-label.js';

test.each([
  ['image:char/avatar/char_002_amiya', 'elite0'],
  ['image:char/avatar/char_002_amiya_2', 'elite2'],
  ['image:char/avatar/char_1012_skadi2', 'elite0'],
  ['image:char/avatar/char_002_amiya_epoque_4', 'skin'],
  ['image:char/portrait/char_002_amiya_1', 'elite0'],
  ['image:char/portrait/char_002_amiya_2', 'elite2'],
  ['image:skin/portrait/char_002_amiya_epoque_4', 'skin'],
])('%s is labelled %s', (key, label) => {
  expect(imageVariantLabel(key as AssetKey)).toBe(label);
});

test.each([
  'image:token/icon/token_10020_ling_soul3',
  'image:enemy/icon/enemy_1007_slime',
  'image:item/mtl_sl_g2',
  'image:char/avatar/token_10020_ling_soul3',
  'spine:char/char_002_amiya/front',
])('%s has no variant label', (key) => {
  expect(imageVariantLabel(key as AssetKey)).toBeUndefined();
});
