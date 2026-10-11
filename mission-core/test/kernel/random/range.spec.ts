import { createRandom } from 'arknights-mission-core';
import { expect, test } from 'vitest';

test('同一种子给同一串数，不同种子不同；数在 [0, 1)；int(n) 是 [0, n) 的整数', () => {
  const a = createRandom(123);
  const b = createRandom(123);
  const c = createRandom(124);
  const xs = Array.from({ length: 50 }, () => a());
  expect(Array.from({ length: 50 }, () => b())).toEqual(xs);
  expect(Array.from({ length: 50 }, () => c())).not.toEqual(xs);
  for (const x of xs) {
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThan(1);
  }
  const random = createRandom(5);
  for (let index = 0; index < 200; index += 1) {
    const value = random.int(7);
    expect(Number.isInteger(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(7);
  }
});
