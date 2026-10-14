import * as v from 'valibot';
import type { StorageBackend } from './backend.js';
import { backendOf, serverScope, type Tier } from './host.js';
import { type Scope, storageKey } from './key.js';

/** Migrations by the version they upgrade from: `migrations[1]` turns version 1 data into version 2. */
export type Migrations = Readonly<Record<number, (data: unknown) => unknown>>;

/** What every stored item declares. */
export interface ItemSpec<T> {
  /** `server` is partitioned by the origin set at boot. */
  readonly scope: 'device' | 'server';
  readonly owner: string;
  readonly key: string;
  readonly schema: v.GenericSchema<unknown, T>;
  /** The current version, from 1. */
  readonly version: number;
  readonly migrations?: Migrations;
  readonly fallback: () => T;
  /** Which adapter keeps it; small by default. */
  readonly tier?: Tier;
  /** An adapter of its own instead of the tier's, for a test that plays several instances. */
  readonly backend?: () => StorageBackend;
}

interface Envelope {
  readonly v: number;
  readonly data: unknown;
}

const isEnvelope = (value: unknown): value is Envelope =>
  typeof value === 'object' &&
  value !== null &&
  Number.isInteger((value as Envelope).v) &&
  'data' in value;

export type Decoded<T> =
  | { readonly ok: true; readonly value: T; readonly upgraded: boolean }
  | { readonly ok: false; readonly value: T };

/** Runs the migration chain up to the current version and checks the schema; anything else is damaged. */
export function decode<T>(raw: unknown, spec: ItemSpec<T>): Decoded<T> {
  const damaged = { ok: false as const, value: spec.fallback() };
  if (!isEnvelope(raw) || raw.v < 1 || raw.v > spec.version) {
    return damaged;
  }
  let data = raw.data;
  try {
    for (let from = raw.v; from < spec.version; from += 1) {
      const step = spec.migrations?.[from];
      if (!step) {
        return damaged;
      }
      data = step(data);
    }
  } catch {
    return damaged;
  }
  const parsed = v.safeParse(spec.schema, data);
  return parsed.success
    ? { ok: true, value: parsed.output, upgraded: raw.v !== spec.version }
    : damaged;
}

export const envelope = (version: number, data: unknown): Envelope => ({
  v: version,
  data,
});

export interface Item<T> {
  readonly spec: ItemSpec<T>;
  /** The full key, which depends on the server origin for a server item. */
  key(): string;
  /** Reads the adapter into the snapshot. */
  load(): Promise<T>;
  /** The snapshot: the loaded value, or the fallback before `load`. */
  get(): T;
  /** Updates the snapshot at once and writes through. */
  set(value: T): Promise<void>;
  delete(): Promise<void>;
  /** Called with the new value when another instance changes the item (when the adapter can watch). */
  watch(listener: (value: T) => void): () => void;
}

const items: Item<unknown>[] = [];

function scopeOf(spec: ItemSpec<unknown>): Scope {
  return spec.scope === 'device' ? { kind: 'device' } : serverScope();
}

/** The key the raw value of a damaged item is kept under, next to it. */
export const damagedKey = (spec: ItemSpec<unknown>): string =>
  storageKey(scopeOf(spec), spec.owner, `${spec.key}.damaged`);

/** Declares an item; it joins the preload. */
export function defineItem<T>(spec: ItemSpec<T>): Item<T> {
  const backend = spec.backend ?? (() => backendOf(spec.tier ?? 'small'));
  const key = () => storageKey(scopeOf(spec), spec.owner, spec.key);
  let snapshot: { readonly value: T } | null = null;
  const read = async (): Promise<T> => {
    const raw = await backend().get(key());
    if (raw === undefined || raw === null) {
      return spec.fallback();
    }
    const decoded = decode(raw, spec);
    if (!decoded.ok) {
      await backend().set(damagedKey(spec), { at: Date.now(), raw });
      await backend().delete(key());
    } else if (decoded.upgraded) {
      await backend().set(key(), envelope(spec.version, decoded.value));
    }
    return decoded.value;
  };
  const item: Item<T> = {
    spec,
    key,
    load: async () => {
      const value = await read();
      snapshot = { value };
      return value;
    },
    get: () => (snapshot ? snapshot.value : spec.fallback()),
    set: async (value) => {
      snapshot = { value };
      await backend().set(key(), envelope(spec.version, value));
    },
    delete: async () => {
      snapshot = null;
      await backend().delete(key());
    },
    watch: (listener) => {
      const watch = backend().watch;
      if (!watch) {
        return () => {};
      }
      return watch((changed) => {
        if (changed === key()) {
          void item.load().then(listener);
        }
      });
    },
  };
  items.push(item as Item<unknown>);
  return item;
}

/** Loads every declared item of the scopes into its snapshot; boot awaits it before the stores read. */
export async function preload(
  scopes: readonly ('device' | 'server')[] = ['device', 'server'],
): Promise<void> {
  await Promise.all(
    items
      .filter((item) => scopes.includes(item.spec.scope))
      .map((item) => item.load()),
  );
}

/** Keeps a store and an item in step: the store starts from the snapshot, writes go through, other instances' writes come in. */
export function persistStore<S, T>(
  store: {
    getState(): S;
    setState(partial: Partial<S>): void;
    subscribe(listener: (state: S, previous: S) => void): () => void;
  },
  item: Item<T>,
  pick: (state: S) => T,
  apply: (value: T) => Partial<S>,
): () => void {
  store.setState(apply(item.get()));
  let incoming = false;
  const stopStore = store.subscribe((state, previous) => {
    if (
      !incoming &&
      JSON.stringify(pick(state)) !== JSON.stringify(pick(previous))
    ) {
      void item.set(pick(state));
    }
  });
  const stopWatch = item.watch((value) => {
    incoming = true;
    store.setState(apply(value));
    incoming = false;
  });
  return () => {
    stopStore();
    stopWatch();
  };
}
