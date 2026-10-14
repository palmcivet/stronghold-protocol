/**
 * Browser capability snapshot. Feature detection only — no User-Agent sniffing.
 * Separate from welcome-protocol Capabilities (`infra/connection/backend`).
 */

export interface Platform {
  readonly indexedDb: boolean;
  readonly broadcastChannel: boolean;
  readonly clipboardWrite: boolean;
  readonly fullscreen: boolean;
  readonly webgl2: boolean;
  readonly secureContext: boolean;
  readonly localStorage: boolean;
  readonly sessionStorage: boolean;
}

export type PlatformOverrides = Partial<Platform>;

let hostOverrides: PlatformOverrides = {};
let snapshot: Platform | null = null;

function canUseStorage(area: 'localStorage' | 'sessionStorage'): boolean {
  try {
    const storage = globalThis[area];
    if (!storage) {
      return false;
    }
    const key = '__wsde_platform__';
    storage.setItem(key, '1');
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function detectWebgl2(): boolean {
  const doc = globalThis.document;
  if (!doc) {
    return false;
  }
  try {
    const canvas = doc.createElement('canvas');
    const gl = canvas.getContext('webgl2', {
      failIfMajorPerformanceCaveat: true,
    });
    if (!gl) {
      return false;
    }
    const lose = (gl as WebGL2RenderingContext).getExtension(
      'WEBGL_lose_context',
    );
    lose?.loseContext();
    return true;
  } catch {
    return false;
  }
}

function detect(): Platform {
  const hasWindow = typeof globalThis.window !== 'undefined';
  return {
    indexedDb: typeof globalThis.indexedDB !== 'undefined',
    broadcastChannel: typeof globalThis.BroadcastChannel === 'function',
    clipboardWrite:
      hasWindow &&
      typeof globalThis.navigator?.clipboard?.writeText === 'function',
    fullscreen:
      hasWindow &&
      typeof globalThis.document?.documentElement?.requestFullscreen ===
        'function',
    webgl2: detectWebgl2(),
    secureContext: hasWindow ? globalThis.isSecureContext === true : false,
    localStorage: canUseStorage('localStorage'),
    sessionStorage: canUseStorage('sessionStorage'),
  };
}

/**
 * Host (Tauri / Capacitor / tests) overrides merged into every probe result.
 * Call before the first `probe` / `getPlatform` when the host knows a capability.
 */
export function configurePlatform(overrides: PlatformOverrides): void {
  hostOverrides = { ...hostOverrides, ...overrides };
  if (snapshot) {
    snapshot = { ...snapshot, ...overrides };
  }
}

/** Collects host capabilities into the snapshot. Safe to call again; results merge. */
export function probe(overrides: PlatformOverrides = {}): Platform {
  snapshot = { ...detect(), ...hostOverrides, ...overrides };
  return snapshot;
}

/** Current snapshot; probes once lazily when nothing has been collected yet. */
export function getPlatform(): Platform {
  return snapshot ?? probe();
}

/** Test helper: clears the snapshot and host overrides. */
export function resetPlatform(): void {
  snapshot = null;
  hostOverrides = {};
}
