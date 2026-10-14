import { expect } from 'vitest';
import type { StorageBackend } from './backend.js';

/**
 * What every storage adapter must do, as `[name, check]` cases. A host adapter (Tauri, Capacitor) runs the same
 * cases: `it.each(BACKEND_CONTRACT)('%s', (_name, check) => check(tauriBackend()))`.
 */
export const BACKEND_CONTRACT: readonly (readonly [
  string,
  (backend: StorageBackend) => Promise<void>,
])[] = [
  [
    'reads back what it wrote, as a copy, and nothing for a missing key',
    async (backend) => {
      const value = { v: 1, data: { list: [1, 2], text: 'é:/' } };
      await backend.set('wsde:device:core:a', value);
      const read = await backend.get('wsde:device:core:a');
      expect(read).toEqual(value);
      expect(read).not.toBe(value);
      expect(await backend.get('wsde:device:core:missing')).toBeUndefined();
    },
  ],
  [
    'overwrites and deletes',
    async (backend) => {
      await backend.set('wsde:device:core:b', 1);
      await backend.set('wsde:device:core:b', 2);
      expect(await backend.get('wsde:device:core:b')).toBe(2);
      await backend.delete('wsde:device:core:b');
      expect(await backend.get('wsde:device:core:b')).toBeUndefined();
      await backend.delete('wsde:device:core:never');
    },
  ],
  [
    'lists keys by prefix',
    async (backend) => {
      await backend.set('wsde:device:example/chat:x', 1);
      await backend.set('wsde:device:example/chat:y', 2);
      await backend.set('wsde:device:core:z', 3);
      expect(
        [...(await backend.keys('wsde:device:example/chat:'))].sort(),
      ).toEqual(['wsde:device:example/chat:x', 'wsde:device:example/chat:y']);
      expect(await backend.keys()).toEqual(
        expect.arrayContaining(['wsde:device:core:z']),
      );
    },
  ],
  [
    'returns a stop function from watch, when it can watch',
    async (backend) => {
      if (!backend.watch) {
        return;
      }
      const stop = backend.watch(() => {});
      expect(typeof stop).toBe('function');
      stop();
    },
  ],
];
