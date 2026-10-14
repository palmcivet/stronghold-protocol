import { CORE_OWNER, checkOwner } from './mod-id.js';

export { CORE_OWNER };

/** Where an item lives: this device, or the server the client talks to (partitioned by its origin). */
export type Scope =
  | { readonly kind: 'device' }
  | { readonly kind: 'server'; readonly origin: string };

const PREFIX = 'wsde';

// the key keeps its text; only the separator and the escape are encoded, so `room.panel` reads as is
const keySegment = (value: string): string =>
  value.replace(/%/g, '%25').replace(/:/g, '%3A');

function scopeSegment(scope: Scope): string {
  return scope.kind === 'device'
    ? 'device'
    : `server=${encodeURIComponent(scope.origin)}`;
}

/** `wsde:<scope>:<owner>:<key>`, such as `wsde:device:example/chat:room.panel`; a server scope reads `server=<origin>`. */
export function storageKey(scope: Scope, owner: string, key: string): string {
  if (!key) {
    throw new Error('a storage item needs a key');
  }
  return [PREFIX, scopeSegment(scope), checkOwner(owner), keySegment(key)].join(
    ':',
  );
}

/** The prefix of every key one owner has in one scope. */
export function ownerPrefix(scope: Scope, owner: string): string {
  return `${[PREFIX, scopeSegment(scope), checkOwner(owner)].join(':')}:`;
}

/** The parts of a storage key, or null for a key the layer did not write. */
export function parseKey(
  full: string,
): { scope: Scope; owner: string; key: string } | null {
  const parts = full.split(':');
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    return null;
  }
  const [, scope = '', owner = '', key = ''] = parts;
  try {
    const rest = { owner, key: decodeURIComponent(key) };
    if (scope === 'device') {
      return { scope: { kind: 'device' }, ...rest };
    }
    if (scope.startsWith('server=')) {
      const origin = decodeURIComponent(scope.slice('server='.length));
      return { scope: { kind: 'server', origin }, ...rest };
    }
  } catch {
    return null;
  }
  return null;
}
