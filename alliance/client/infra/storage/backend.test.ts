// @vitest-environment jsdom

import 'fake-indexeddb/auto';
import { afterEach, describe, it } from 'vitest';
import {
  browserDeviceSecretBackend,
  browserLargeBackend,
  browserSmallBackend,
  browserTabBackend,
  memoryBackend,
  type StorageBackend,
} from './backend.js';
import { BACKEND_CONTRACT } from './backend-contract.js';

let database = 0;

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

const ADAPTERS: readonly (readonly [string, () => StorageBackend])[] = [
  ['memory', memoryBackend],
  ['browser small (localStorage)', browserSmallBackend],
  [
    'browser large (IndexedDB)',
    () => {
      database += 1;
      return browserLargeBackend(`wsde-test-${database}`);
    },
  ],
  ['browser tab secret (sessionStorage)', browserTabBackend],
  ['browser device secret (localStorage)', browserDeviceSecretBackend],
];

describe.each(ADAPTERS)('storage adapter contract: %s', (_adapter, make) => {
  it.each(BACKEND_CONTRACT)('%s', (_name, check) => check(make()));
});
