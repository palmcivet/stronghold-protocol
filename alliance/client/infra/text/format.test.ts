import { describe, expect, it } from 'vitest';
import { formatMessage } from './format.js';

describe('formatMessage', () => {
  it('fills named placeholders', () => {
    expect(formatMessage('第 {round} 回合', { round: 3 })).toBe('第 3 回合');
  });

  it('leaves a placeholder without a value', () => {
    expect(formatMessage('{name} 加入', {})).toBe('{name} 加入');
  });

  it('selects plural forms', () => {
    const pattern = '{count, plural, one {# unit} other {# units}}';
    expect(formatMessage(pattern, { count: 1 }, 'en')).toBe('1 unit');
    expect(formatMessage(pattern, { count: 4 }, 'en')).toBe('4 units');
    expect(
      formatMessage('{count, plural, =0 {none} other {#}}', { count: 0 }),
    ).toBe('none');
  });
});
