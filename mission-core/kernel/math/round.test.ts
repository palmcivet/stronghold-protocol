import { describe, expect, it } from 'vitest';
import { roundHalfEven } from '#kernel/math/round.js';

describe('roundHalfEven', () => {
  it('正中取偶数，其余取最近的整数，不出现 −0', () => {
    const cases: readonly (readonly [number, number])[] = [
      [0.5, 0],
      [1.5, 2],
      [2.5, 2],
      [3.5, 4],
      [10.5, 10],
      [11.5, 12],
      [-0.5, 0],
      [-1.5, -2],
      [-2.5, -2],
      [2.4999999999999996, 2],
      [2.5000000000000004, 3],
      [-0.4, 0],
      [-0, 0],
      [7, 7],
      [4503599627370495.5, 4503599627370496],
    ];
    for (const [x, want] of cases) {
      expect(Object.is(roundHalfEven(x), want)).toBe(true);
    }
    for (let i = -2000; i <= 2000; i += 1) {
      const x = i / 8;
      const value = roundHalfEven(x);
      const gap = Math.abs(x - value);
      expect(Number.isInteger(value)).toBe(true);
      expect(gap < 0.5 || (gap === 0.5 && value % 2 === 0)).toBe(true);
      if (gap !== 0.5) {
        expect(value).toBe(Math.round(x) + 0);
      }
    }
  });
});
