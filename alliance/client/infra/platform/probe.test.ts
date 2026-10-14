import { afterEach, describe, expect, it } from 'vitest';
import {
  configurePlatform,
  getPlatform,
  probe,
  resetPlatform,
} from './probe.js';

afterEach(() => {
  resetPlatform();
});

describe('platform', () => {
  it('probes and returns the same snapshot from getPlatform', () => {
    const first = probe();
    expect(getPlatform()).toBe(first);
    expect(typeof first.indexedDb).toBe('boolean');
    expect(typeof first.broadcastChannel).toBe('boolean');
    expect(typeof first.clipboardWrite).toBe('boolean');
    expect(typeof first.fullscreen).toBe('boolean');
    expect(typeof first.webgl2).toBe('boolean');
    expect(typeof first.secureContext).toBe('boolean');
  });

  it('merges host overrides and call-site overrides', () => {
    configurePlatform({ indexedDb: false, webgl2: true });
    const result = probe({ clipboardWrite: false });
    expect(result.indexedDb).toBe(false);
    expect(result.webgl2).toBe(true);
    expect(result.clipboardWrite).toBe(false);
    expect(getPlatform().indexedDb).toBe(false);
  });

  it('getPlatform probes lazily when nothing was collected', () => {
    const platform = getPlatform();
    expect(platform).toEqual(getPlatform());
  });
});
