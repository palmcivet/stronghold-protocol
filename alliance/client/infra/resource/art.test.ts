import { describe, expect, it } from 'vitest';
import { artKey, avatarVariants } from './art.js';
import type { ResourceStore } from './store.js';

const refs: Readonly<Record<string, string>> = {
  'chars/char_a/avatar': 'image:char/avatar/char_a',
  'chars/char_a/avatarElite': 'image:char/avatar/char_a_2',
  'chars/char_b/avatar': 'image:char/avatar/char_b',
};
const labels: Readonly<Record<string, string>> = {
  'image:char/avatar/char_a': 'elite0',
  'image:char/avatar/char_a_2': 'elite2',
};
const resources = {
  ref: (path: string | readonly string[]) =>
    refs[typeof path === 'string' ? path : path.join('/')] ?? null,
  refs: {
    chars: {
      char_a: {
        avatar: 'image:char/avatar/char_a',
        avatarElite: 'image:char/avatar/char_a_2',
        portrait: 'image:char/portrait/char_a',
      },
      char_b: { avatar: 'image:char/avatar/char_b' },
    },
  },
  resolver: {
    has: (key: string) => key === 'image:ui/guide/autochess_home_1',
    entry: (key: string) =>
      key in labels || key.startsWith('image:')
        ? { asset: labels[key] ? { label: labels[key] } : {} }
        : null,
  },
} as unknown as ResourceStore;

describe('art', () => {
  it('finds a key by ref path or takes an asset key the store has', () => {
    expect(artKey(resources, ['chars', 'char_a', 'avatar'])).toBe(
      'image:char/avatar/char_a',
    );
    expect(artKey(resources, 'image:ui/guide/autochess_home_1')).toBe(
      'image:ui/guide/autochess_home_1',
    );
    expect(artKey(resources, 'image:ui/guide/missing')).toBeNull();
  });

  it('lists the labelled images as avatar variants; unlabelled ones are none', () => {
    expect(avatarVariants(resources, ['char_a', 'char_b', 'char_c'])).toEqual([
      { charId: 'char_a', key: 'image:char/avatar/char_a', label: 'elite0' },
      { charId: 'char_a', key: 'image:char/avatar/char_a_2', label: 'elite2' },
    ]);
    expect(avatarVariants(null, ['char_a'])).toEqual([]);
  });
});
