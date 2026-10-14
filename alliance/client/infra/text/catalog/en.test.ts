import { describe, expect, it } from 'vitest';
import type { CoreKey } from '#infra/text/key.js';
import { CORE } from './core.js';
import { EN } from './en.js';

/** Key groups whose pages are filled in (UI inventory step 2); each page unit adds its groups. */
const DONE = [
  'app',
  'common',
  'connection',
  'shell',
  'nav',
  'menu',
  'room',
  'briefing',
  'strategy',
  'info',
  'spectating',
  'settings',
  'entry',
  'title',
  'lobby',
  'difficulty',
  'profile',
  'data',
  'vote',
  'loadout',
  'ownership',
  'diy',
] as const;

const groupOf = (key: string): string =>
  key.slice('core:'.length).split('.')[0] ?? '';

describe('English catalog', () => {
  it('has every key of the filled-in pages', () => {
    const keys = Object.keys(CORE) as CoreKey[];
    const missing = keys.filter(
      (key) =>
        (DONE as readonly string[]).includes(groupOf(key)) &&
        EN[key] === undefined,
    );
    expect(missing).toEqual([]);
  });

  it('only has keys the source has', () => {
    expect(Object.keys(EN).filter((key) => !(key in CORE))).toEqual([]);
  });
});
