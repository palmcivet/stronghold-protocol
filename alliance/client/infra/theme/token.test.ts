import { describe, expect, it } from 'vitest';
import { color, tokenProperties, tokenSheet } from './token.js';
import { TOKENS } from './tokens.js';

describe('tokens', () => {
  it('compiles colors with and without alpha', () => {
    expect(tokenProperties({ bg: color('#0c0f0e') })).toEqual([
      ['--bg', '#0c0f0e'],
    ]);
    expect(tokenProperties({ glass: color('#101412', 0.82) })).toEqual([
      ['--glass', 'rgb(16 20 18 / 0.82)'],
    ]);
  });

  it('writes the default tokens into the tokens layer', () => {
    const sheet = tokenSheet(TOKENS, 'tokens');
    expect(sheet.startsWith('@layer tokens {')).toBe(true);
    const names = tokenProperties(TOKENS).map(([name]) => name);
    expect(names).toContain('--color-accent-500');
    expect(names).toContain('--duration-fast');
    expect(new Set(names).size).toBe(names.length);
  });
});
