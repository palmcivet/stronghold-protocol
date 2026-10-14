import {
  browserDeviceSecretBackend,
  browserLargeBackend,
  browserSmallBackend,
  browserTabBackend,
  memoryBackend,
  type StorageBackend,
} from './backend.js';
import type { Scope } from './key.js';

/**
 * The slots: small config, large data, and two secret slots. `secureTab` lives as long as this instance (a browser
 * tab: sessionStorage; a new tab starts empty and never inherits it); `secureDevice` is shared by every instance on
 * the device (the recent token list). A host backs both with the OS keychain or its own secure store.
 */
export type Tier = 'small' | 'large' | 'secureTab' | 'secureDevice';

export type StorageHost = Readonly<Record<Tier, StorageBackend>>;

const hasWindow = typeof window !== 'undefined';

function browserHost(): StorageHost {
  return {
    small: browserSmallBackend(),
    large:
      typeof indexedDB === 'undefined'
        ? memoryBackend()
        : browserLargeBackend(),
    secureTab: browserTabBackend(),
    secureDevice: browserDeviceSecretBackend(),
  };
}

let host: StorageHost | null = null;
let origin: string | null = null;

/** Replaces some or all adapters; `infra/boot` calls it for a Tauri or Capacitor host, the tests for memory. */
export function configureStorage(adapters: Partial<StorageHost>): void {
  host = {
    ...(host ?? (hasWindow ? browserHost() : memoryHost())),
    ...adapters,
  };
}

export function memoryHost(): StorageHost {
  return {
    small: memoryBackend(),
    large: memoryBackend(),
    secureTab: memoryBackend(),
    secureDevice: memoryBackend(),
  };
}

export function backendOf(tier: Tier): StorageBackend {
  host ??= hasWindow ? browserHost() : memoryHost();
  return host[tier];
}

/** The server the client talks to; set at boot from the backend address. */
export function setServerOrigin(next: string): void {
  origin = next;
}

export function serverScope(): Scope {
  return { kind: 'server', origin: origin ?? 'unknown' };
}

export const DEVICE: Scope = { kind: 'device' };
