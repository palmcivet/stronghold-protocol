import { describe, expect, it } from 'vitest';
import { DEFAULT_KEYS } from '../store/settings.js';
import { boundIntent } from './keys.js';

describe('key bindings', () => {
  it('maps the default keys and a rebound key', () => {
    expect(boundIntent('KeyD', DEFAULT_KEYS)).toEqual({ type: 'g.refresh' });
    expect(boundIntent('KeyR', { ...DEFAULT_KEYS, refresh: 'KeyR' })).toEqual({
      type: 'g.refresh',
    });
    expect(
      boundIntent('KeyD', { ...DEFAULT_KEYS, refresh: 'KeyR' }),
    ).toBeNull();
  });
});
