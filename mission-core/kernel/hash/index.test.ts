import { describe, expect, test } from 'vitest';
import { canonicalJson, hashText } from '#kernel/hash/index.js';

describe('canonicalJson', () => {
  test('sorts keys and drops undefined properties', () => {
    expect(canonicalJson({ b: 1, a: [true, null, 'x'], c: undefined })).toBe(
      '{"a":[true,null,"x"],"b":1}',
    );
  });

  test('writes -0, NaN and Infinity as literals', () => {
    expect(canonicalJson([-0, Number.NaN, Number.POSITIVE_INFINITY, 0.1])).toBe(
      '[-0,NaN,Infinity,0.1]',
    );
  });

  test('rejects functions and class instances with their path', () => {
    expect(() => canonicalJson({ a: [{ run: () => 1 }] })).toThrow(
      'not plain data at value.a[0].run: function',
    );
    expect(() => canonicalJson({ at: new Map() })).toThrow(
      'not plain data at value.at: object',
    );
  });
});

describe('hashText', () => {
  test('is pinned for known inputs', () => {
    expect(hashText('')).toBe('811c9dc5050c5d1f');
    expect(hashText('a')).toBe(hashText('a'));
    expect(hashText('a')).not.toBe(hashText('b'));
    expect(hashText('a')).toHaveLength(16);
  });
});
