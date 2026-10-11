import { describe, expect, it } from 'vitest';
import { createObjectPool } from '#actor/entity/pool.js';

describe('object pool', () => {
  it('reuses released objects of the same kind after resetting them', () => {
    let made = 0;
    const pool = createObjectPool<'a' | 'b', { id: number; used: boolean }>({
      create: () => {
        made += 1;
        return { id: made, used: false };
      },
      reset: (item) => {
        item.used = false;
      },
    });
    const first = pool.acquire('a');
    first.used = true;
    pool.release('a', first);
    expect(pool.idle('a')).toBe(1);
    expect(pool.acquire('b').id).toBe(2);
    const again = pool.acquire('a');
    expect(again).toBe(first);
    expect(again.used).toBe(false);
  });

  it('disposes objects beyond the limit and on clear', () => {
    const disposed: number[] = [];
    let made = 0;
    const pool = createObjectPool<'a', number>({
      create: () => {
        made += 1;
        return made;
      },
      reset: () => undefined,
      dispose: (item) => {
        disposed.push(item);
      },
      limit: 1,
    });
    const one = pool.acquire('a');
    const two = pool.acquire('a');
    pool.release('a', one);
    pool.release('a', two);
    expect(disposed).toEqual([two]);
    pool.clear();
    expect(disposed).toEqual([two, one]);
    expect(pool.idle('a')).toBe(0);
  });
});
