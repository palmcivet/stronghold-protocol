import {
  type AssetKey,
  fileAddress,
  type PackManifest,
} from 'arknights-assets-catalog';

const CSS_FORMATS: Readonly<Record<string, string>> = Object.freeze({
  woff2: 'woff2',
  woff: 'woff',
  otf: 'opentype',
  ttf: 'truetype',
});

const FONT_WEIGHT: Readonly<Record<string, number>> = Object.freeze({
  thin: 100,
  extralight: 200,
  light: 300,
  regular: 400,
  normal: 400,
  book: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  extrabold: 800,
  black: 900,
});

/** `bender` → `Bender`, `novecento-wide` → `Novecento Wide`. */
function familyName(slug: string): string {
  return slug
    .split('-')
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * `@font-face` rules for the font keys of a base pack.
 * `font:bender/regular` and `font:bender/light` share the family `Bender` at weights 400 and 300.
 * Sources come in file order: WOFF2 first, the original after it.
 */
export function fontsCss(manifest: PackManifest): string {
  const rules = (Object.keys(manifest.assets) as AssetKey[])
    .filter((key) => key.startsWith('font:'))
    .sort()
    .map((key) => {
      const asset = manifest.assets[key];
      if (!asset) {
        throw new Error(`${key} has no asset`);
      }
      const parts = key.slice('font:'.length).split('/');
      const style = parts.pop() ?? 'regular';
      const family = familyName(parts.join('-'));
      const weight = FONT_WEIGHT[style] ?? 400;
      const sources = asset.files.map((file) => {
        const format = CSS_FORMATS[file.format];
        if (!format) {
          throw new Error(
            `${key} has a font file format ${file.format} that CSS does not name`,
          );
        }
        return `url("${manifest.fileRoot}${fileAddress(key, { name: file.name, format: file.format })}?v=${file.hash.slice(0, 12)}") format("${format}")`;
      });
      return `@font-face {\n  font-family: "${family}";\n  font-weight: ${weight};\n  src: ${sources.join(',\n    ')};\n  font-display: swap;\n}\n`;
    });
  return rules.join('\n');
}
