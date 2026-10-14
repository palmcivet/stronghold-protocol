import type * as v from 'valibot';
import type { StorageBackend } from './backend.js';
import { decode, envelope, type Migrations } from './item.js';
import { ownerPrefix, type Scope, storageKey } from './key.js';
import { parseModId } from './mod-id.js';

/** One key a mod declares in its manifest before it may use it. */
export interface ModKeySpec<T = unknown> {
  readonly scope: 'device' | 'server';
  readonly schema: v.GenericSchema<unknown, T>;
  readonly version: number;
  readonly migrations?: Migrations;
  readonly fallback: () => T;
}

/** Bytes of JSON a mod may keep, all its keys together, unless the host grants more. */
export const DEFAULT_MOD_QUOTA = 256 * 1024;

/** `ctx.storage`: the only storage a mod sees, under its own id and its declared keys. */
export interface ModStorage {
  get<T>(key: string): Promise<T>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  /** Every stored value of the mod, for a backup file. */
  export(): Promise<Readonly<Record<string, unknown>>>;
  /** Restores a backup; keys it did not declare and values its schemas refuse are skipped and returned. */
  import(data: Readonly<Record<string, unknown>>): Promise<readonly string[]>;
}

/** The host side: what the extension system uses around a mod's storage. */
export interface ModStorageHost {
  readonly storage: ModStorage;
  /** Bytes in use. */
  usage(): Promise<number>;
  /** Removes everything of the mod, on uninstall. */
  clear(): Promise<void>;
  /** A read-only view for the debug panel: key to stored data. */
  inspect(): Promise<Readonly<Record<string, unknown>>>;
}

const size = (value: unknown): number =>
  new TextEncoder().encode(JSON.stringify(value)).length;

/** Builds the storage of one mod; the mod id is checked with the mod id schema. */
export function createModStorage(options: {
  readonly modId: string;
  readonly keys: Readonly<Record<string, ModKeySpec>>;
  readonly backend: StorageBackend;
  readonly server: () => Scope;
  readonly quota?: number;
  /** A mod the app ships, which may use a reserved author. */
  readonly bundled?: boolean;
}): ModStorageHost {
  const owner = parseModId(options.modId, {
    bundled: options.bundled ?? false,
  });
  const quota = options.quota ?? DEFAULT_MOD_QUOTA;
  const declared = (key: string): ModKeySpec => {
    const spec = options.keys[key];
    if (!spec) {
      throw new Error(`${owner} has not declared the storage key "${key}"`);
    }
    return spec;
  };
  const scopeOf = (spec: ModKeySpec): Scope =>
    spec.scope === 'device' ? { kind: 'device' } : options.server();
  const full = (key: string): string =>
    storageKey(scopeOf(declared(key)), owner, key);
  const ownKeys = async (): Promise<string[]> => {
    const scopes: Scope[] = [{ kind: 'device' }, options.server()];
    const found = await Promise.all(
      scopes.map((scope) => options.backend.keys(ownerPrefix(scope, owner))),
    );
    return found.flat();
  };
  const usage = async (): Promise<number> => {
    let total = 0;
    for (const key of await ownKeys()) {
      total += size(await options.backend.get(key));
    }
    return total;
  };
  const storage: ModStorage = {
    get: async <T>(key: string) => {
      const spec = declared(key);
      const raw = await options.backend.get(full(key));
      if (raw === undefined || raw === null) {
        return spec.fallback() as T;
      }
      return decode(raw, { ...spec, owner, key }).value as T;
    },
    set: async <T>(key: string, value: T) => {
      const spec = declared(key);
      const checked = decode(envelope(spec.version, value), {
        ...spec,
        owner,
        key,
      });
      if (!checked.ok) {
        throw new Error(`${owner}: the value of "${key}" fails its schema`);
      }
      const next = envelope(spec.version, checked.value);
      const before = await options.backend.get(full(key));
      const after =
        (await usage()) -
        (before === undefined ? 0 : size(before)) +
        size(next);
      if (after > quota) {
        throw new Error(`${owner} is over its storage quota of ${quota} bytes`);
      }
      await options.backend.set(full(key), next);
    },
    delete: async (key) => {
      await options.backend.delete(full(key));
    },
    export: async () => {
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(options.keys)) {
        const raw = await options.backend.get(full(key));
        if (raw !== undefined) {
          out[key] = raw;
        }
      }
      return out;
    },
    import: async (data) => {
      const skipped: string[] = [];
      for (const [key, raw] of Object.entries(data)) {
        const spec = options.keys[key];
        const decoded = spec ? decode(raw, { ...spec, owner, key }) : null;
        if (!spec || !decoded?.ok) {
          skipped.push(key);
          continue;
        }
        await storage.set(key, decoded.value);
      }
      return skipped;
    },
  };
  return {
    storage,
    usage,
    clear: async () => {
      for (const key of await ownKeys()) {
        await options.backend.delete(key);
      }
    },
    inspect: async () => {
      const out: Record<string, unknown> = {};
      for (const key of await ownKeys()) {
        out[key] = structuredClone(await options.backend.get(key));
      }
      return Object.freeze(out);
    },
  };
}
