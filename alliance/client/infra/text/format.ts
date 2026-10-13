/** Values a message placeholder takes. */
export type MessageParams = Readonly<Record<string, string | number>>;

/**
 * Formats the ICU MessageFormat subset the catalogs use: `{name}` and `{count, plural, one {…} other {…}}` with `#`.
 * A placeholder without a value is left as written.
 */
export function formatMessage(
  pattern: string,
  params: MessageParams = {},
  locale = 'zh-Hans',
): string {
  let out = '';
  let index = 0;
  while (index < pattern.length) {
    const open = pattern.indexOf('{', index);
    if (open < 0) {
      out += pattern.slice(index);
      break;
    }
    out += pattern.slice(index, open);
    const close = matchingBrace(pattern, open);
    if (close < 0) {
      out += pattern.slice(open);
      break;
    }
    out += formatArgument(pattern.slice(open + 1, close), params, locale);
    index = close + 1;
  }
  return out;
}

function matchingBrace(pattern: string, open: number): number {
  let depth = 0;
  for (let index = open; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
}

function formatArgument(
  body: string,
  params: MessageParams,
  locale: string,
): string {
  const [rawName = '', rawType, ...rest] = body.split(',');
  const name = rawName.trim();
  const value = params[name];
  if (rawType?.trim() === 'plural') {
    const count = Number(value);
    const options = parseOptions(rest.join(','));
    const exact = options.get(`=${count}`);
    const category = new Intl.PluralRules(locale).select(count);
    const chosen = exact ?? options.get(category) ?? options.get('other') ?? '';
    return formatMessage(chosen, params, locale).replaceAll('#', String(count));
  }
  return value === undefined ? `{${body}}` : String(value);
}

function parseOptions(source: string): Map<string, string> {
  const options = new Map<string, string>();
  let index = 0;
  while (index < source.length) {
    const open = source.indexOf('{', index);
    if (open < 0) {
      break;
    }
    const selector = source.slice(index, open).trim();
    const close = matchingBrace(source, open);
    if (close < 0) {
      break;
    }
    options.set(selector, source.slice(open + 1, close));
    index = close + 1;
  }
  return options;
}
