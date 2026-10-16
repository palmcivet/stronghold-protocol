import { describe, expect, it } from 'vitest';
import { color, tokenProperties, tokenSheet } from './token.js';
import { TOKENS } from './tokens.js';

describe('tokens', () => {
  it('compiles colors with and without alpha', () => {
    expect(tokenProperties({ bg: color('#0c0f0e') })).toEqual([
      ['--wsde-bg', '#0c0f0e'],
    ]);
    expect(tokenProperties({ glass: color('#101412', 0.82) })).toEqual([
      ['--wsde-glass', 'rgb(16 20 18 / 0.82)'],
    ]);
  });

  it('writes the default tokens into the tokens layer', () => {
    const sheet = tokenSheet(TOKENS, 'tokens');
    expect(sheet.startsWith('@layer tokens {')).toBe(true);
    const names = tokenProperties(TOKENS).map(([name]) => name);
    expect(names).toContain('--wsde-palette-mint-500');
    expect(names).toContain('--wsde-color-surface-base');
    expect(names).toContain('--wsde-font-size-body');
    expect(names).toContain('--wsde-duration-fast');
    expect(names).not.toContain('--wsde-breakpoint-medium');
    expect(sheet).toContain(
      '--wsde-color-surface-base: var(--wsde-palette-gray-950);',
    );
    expect(sheet).toContain('--wsde-space-1: calc(var(--wsde-dp) * 4);');
    expect(sheet).toContain(
      '--wsde-font-size-body: calc(var(--wsde-text-dp) * 24);',
    );
    expect(sheet).toContain('--wsde-stroke-thin: 1px;');
    expect(new Set(names).size).toBe(names.length);
  });
});
