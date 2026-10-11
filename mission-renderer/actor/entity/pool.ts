/** Reusable objects kept apart by kind. */
export interface ObjectPool<TKind extends string, TItem> {
  acquire(kind: TKind): TItem;
  release(kind: TKind, item: TItem): void;
  /** Objects waiting to be reused, by kind. */
  idle(kind: TKind): number;
  clear(): void;
}

export interface ObjectPoolOptions<TKind extends string, TItem> {
  create(kind: TKind): TItem;
  /** Returns a released object to its fresh state. */
  reset(item: TItem): void;
  /** Called on objects dropped by `clear` or beyond `limit`. */
  dispose?(item: TItem): void;
  /** Idle objects kept per kind. Defaults to 64. */
  readonly limit?: number;
}

export function createObjectPool<TKind extends string, TItem>(
  options: ObjectPoolOptions<TKind, TItem>,
): ObjectPool<TKind, TItem> {
  const limit = Math.max(0, options.limit ?? 64);
  const free = new Map<TKind, TItem[]>();
  return {
    acquire(kind) {
      return free.get(kind)?.pop() ?? options.create(kind);
    },
    release(kind, item) {
      options.reset(item);
      const list = free.get(kind) ?? [];
      if (list.length >= limit) {
        options.dispose?.(item);
        return;
      }
      list.push(item);
      free.set(kind, list);
    },
    idle(kind) {
      return free.get(kind)?.length ?? 0;
    },
    clear() {
      for (const list of free.values()) {
        for (const item of list) {
          options.dispose?.(item);
        }
      }
      free.clear();
    },
  };
}
