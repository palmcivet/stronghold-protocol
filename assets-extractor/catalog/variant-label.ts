// 立绘与头像的变体标签：由键（即上游文件名去掉扩展名后的安全名）推出精零、精二或皮肤。

import { type AssetKey, parseAssetKey } from 'arknights-assets-catalog';

/** Operator id at the start of an upstream name, e.g. `char_002_amiya` in `char_002_amiya_2`. */
const CHAR_ID = /^char_\d+_[A-Za-z0-9]+/;

/** Name suffix after the operator id to its elite label. */
const ELITE_SUFFIXES: Readonly<Record<string, string>> = {
  '': 'elite0',
  _1: 'elite0',
  _2: 'elite2',
};

/**
 * Variant label of an operator portrait or avatar: `elite0` for the base name or `_1`, `elite2` for `_2`, `skin` for any
 * other suffix (a skin id such as `_epoque_4`) and for every `skin/portrait` key. Undefined for other keys.
 */
export function imageVariantLabel(key: AssetKey): string | undefined {
  const { kind, segments } = parseAssetKey(key);
  const [namespace, group, name] = segments;
  if (kind !== 'image' || segments.length !== 3 || name === undefined) {
    return undefined;
  }
  if (namespace === 'skin' && group === 'portrait') {
    return 'skin';
  }
  if (namespace !== 'char' || (group !== 'avatar' && group !== 'portrait')) {
    return undefined;
  }
  const id = CHAR_ID.exec(name);
  if (!id) {
    return undefined;
  }
  const suffix = name.slice(id[0].length);
  return ELITE_SUFFIXES[suffix] ?? 'skin';
}
