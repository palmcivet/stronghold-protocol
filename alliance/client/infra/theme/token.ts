/** Design tokens in the W3C Design Tokens format (2025.10). */

export interface ColorValue {
  readonly colorSpace: 'srgb';
  readonly components: readonly [number, number, number];
  readonly alpha?: number;
  readonly hex: string;
}

export interface DurationValue {
  readonly value: number;
  readonly unit: 'ms' | 's';
}

export interface DimensionValue {
  readonly value: number;
  readonly unit: 'px' | 'rem';
}

export type Token =
  | { readonly $type: 'color'; readonly $value: ColorValue }
  | { readonly $type: 'duration'; readonly $value: DurationValue }
  | { readonly $type: 'dimension'; readonly $value: DimensionValue }
  | { readonly $type: 'fontFamily'; readonly $value: readonly string[] }
  | {
      readonly $type: 'cubicBezier';
      readonly $value: readonly [number, number, number, number];
    }
  | { readonly $type: 'number'; readonly $value: number };

export interface TokenGroup {
  readonly [name: string]: Token | TokenGroup;
}

const isToken = (value: Token | TokenGroup): value is Token =>
  typeof (value as Token).$type === 'string' && '$value' in value;

/** A color token from `#rrggbb` and an optional alpha. */
export function color(hex: string, alpha?: number): Token {
  const channel = (offset: number): number =>
    Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
  const value: ColorValue = {
    colorSpace: 'srgb',
    components: [channel(1), channel(3), channel(5)],
    hex,
    ...(alpha === undefined ? {} : { alpha }),
  };
  return { $type: 'color', $value: value };
}

function cssValue(token: Token): string {
  switch (token.$type) {
    case 'color': {
      const { hex, alpha, components } = token.$value;
      if (alpha === undefined || alpha === 1) {
        return hex;
      }
      const [red, green, blue] = components.map((part) =>
        Math.round(part * 255),
      );
      return `rgb(${red} ${green} ${blue} / ${alpha})`;
    }
    case 'duration':
    case 'dimension':
      return `${token.$value.value}${token.$value.unit}`;
    case 'fontFamily':
      return token.$value
        .map((family) => (/^[a-z-]+$/.test(family) ? family : `'${family}'`))
        .join(', ');
    case 'cubicBezier':
      return `cubic-bezier(${token.$value.join(', ')})`;
    case 'number':
      return String(token.$value);
  }
}

/** Custom properties of a token tree: the path joined by `-`, such as `--color-bg-0`. */
export function tokenProperties(
  group: TokenGroup,
  prefix: readonly string[] = [],
): readonly (readonly [string, string])[] {
  const out: (readonly [string, string])[] = [];
  for (const [name, value] of Object.entries(group)) {
    if (name.startsWith('$')) {
      continue;
    }
    const path = [...prefix, name];
    if (isToken(value)) {
      out.push([`--${path.join('-')}`, cssValue(value)]);
    } else {
      out.push(...tokenProperties(value, path));
    }
  }
  return out;
}

/** A style sheet that sets the tokens on `:root` inside a cascade layer. */
export function tokenSheet(group: TokenGroup, layer: string): string {
  const lines = tokenProperties(group).map(
    ([property, value]) => `    ${property}: ${value};`,
  );
  return `@layer ${layer} {\n  :root {\n${lines.join('\n')}\n  }\n}\n`;
}
