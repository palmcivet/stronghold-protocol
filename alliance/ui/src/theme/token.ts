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
  /** `dp` scales with the canvas; `text` also follows the text-size factor; `px` is a real device pixel. */
  readonly unit: 'px' | 'dp' | 'text';
}

export interface ShadowValue {
  readonly color: ColorValue;
  readonly offsetX: DimensionValue;
  readonly offsetY: DimensionValue;
  readonly blur: DimensionValue;
  readonly spread: DimensionValue;
  readonly inset?: boolean;
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
  | { readonly $type: 'number'; readonly $value: number }
  | { readonly $type: 'shadow'; readonly $value: readonly ShadowValue[] }
  | { readonly $type: 'alias'; readonly $value: string };

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

/** A dimension token. Box sizes are design pixels; text sizes follow the text-size factor. */
export function dimension(
  value: number,
  unit: 'px' | 'dp' | 'text' = 'dp',
): Token {
  return { $type: 'dimension', $value: { value, unit } };
}

/** A custom property that points at another token, such as a semantic color over the palette. */
export function alias(variable: string): Token {
  return { $type: 'alias', $value: variable };
}

/** A shadow token of one or more layers: `[x, y, blur, spread]` in dp, a color and an optional inset. */
export function shadow(
  ...layers: readonly {
    readonly at: readonly [number, number, number, number];
    readonly color: Token;
    readonly inset?: boolean;
  }[]
): Token {
  const dp = (value: number): DimensionValue => ({ value, unit: 'dp' });
  return {
    $type: 'shadow',
    $value: layers.map(({ at, color: tint, inset }) => {
      if (tint.$type !== 'color') {
        throw new TypeError('a shadow color must be a color token');
      }
      return {
        color: tint.$value,
        offsetX: dp(at[0]),
        offsetY: dp(at[1]),
        blur: dp(at[2]),
        spread: dp(at[3]),
        ...(inset ? { inset } : {}),
      };
    }),
  };
}

function colorCss({ hex, alpha, components }: ColorValue): string {
  if (alpha === undefined || alpha === 1) {
    return hex;
  }
  const [red, green, blue] = components.map((part) => Math.round(part * 255));
  return `rgb(${red} ${green} ${blue} / ${alpha})`;
}

function dimensionCss({ value, unit }: DimensionValue): string {
  if (value === 0) {
    return '0';
  }
  if (unit === 'px') {
    return `${value}px`;
  }
  const variable = unit === 'text' ? '--wsde-text-dp' : '--wsde-dp';
  return `calc(var(${variable}) * ${value})`;
}

function cssValue(token: Token): string {
  switch (token.$type) {
    case 'color':
      return colorCss(token.$value);
    case 'shadow':
      return token.$value
        .map((layer) =>
          [
            layer.inset ? 'inset' : null,
            dimensionCss(layer.offsetX),
            dimensionCss(layer.offsetY),
            dimensionCss(layer.blur),
            dimensionCss(layer.spread),
            colorCss(layer.color),
          ]
            .filter((part) => part !== null)
            .join(' '),
        )
        .join(', ');
    case 'duration':
      return `${token.$value.value}${token.$value.unit}`;
    case 'dimension':
      return dimensionCss(token.$value);
    case 'fontFamily':
      return token.$value
        .map((family) => (/^[a-z-]+$/.test(family) ? family : `'${family}'`))
        .join(', ');
    case 'cubicBezier':
      return `cubic-bezier(${token.$value.join(', ')})`;
    case 'number':
      return String(token.$value);
    case 'alias':
      return `var(${token.$value})`;
  }
}

/** Custom properties of a token tree: the path joined by `-`, such as `--wsde-color-surface-base`. */
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
      out.push([`--wsde-${path.join('-')}`, cssValue(value)]);
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
