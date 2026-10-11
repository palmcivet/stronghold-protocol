import {
  RegistrationConflictError,
  UnknownRegistrationError,
} from '#kernel/registry/error.js';

export interface Identified {
  readonly id: string;
}

/** 按 id 注册的一张表。同 id 再注册报 RegistrationConflictError，换掉已有的一项用 replace。 */
export interface Table<T extends Identified> {
  register(item: T): void;
  /** 换掉已注册的同 id 项，返回原来那项。没有这个 id 时报 UnknownRegistrationError。 */
  replace(item: T): T;
  has(id: string): boolean;
  require(id: string): T;
}

/** 记下注册先后的表。replace 保留原来那项的注册先后。 */
export interface OrderedTable<T extends Identified> extends Table<T> {
  /** 先按建表时给的 compare，再按注册先后。两次注册之间返回同一个数组。 */
  ordered(): readonly T[];
  /** 每次注册或替换加 1。按它判断由 ordered() 推出的结果是否还能用。 */
  readonly version: number;
}

export function createTable<T extends Identified>(registry: string): Table<T> {
  const items = new Map<string, T>();
  return {
    register(item) {
      if (items.has(item.id)) {
        throw new RegistrationConflictError(registry, item.id);
      }
      items.set(item.id, item);
    },
    replace(item) {
      const previous = items.get(item.id);
      if (!previous) {
        throw new UnknownRegistrationError(registry, item.id);
      }
      items.set(item.id, item);
      return previous;
    },
    has: (id) => items.has(id),
    require(id) {
      const item = items.get(id);
      if (!item) {
        throw new UnknownRegistrationError(registry, id);
      }
      return item;
    },
  };
}

export interface OrderedTableOptions<T> {
  /** 先按它排，相同时按注册先后。缺省只按注册先后。 */
  readonly compare?: (left: T, right: T) => number;
}

export function createOrderedTable<T extends Identified>(
  registry: string,
  options: OrderedTableOptions<T> = {},
): OrderedTable<T> {
  const { compare } = options;
  let order = 0;
  let version = 0;
  let sorted: readonly T[] | null = null;
  const entries = new Map<string, { item: T; order: number }>();
  return {
    register(item) {
      if (entries.has(item.id)) {
        throw new RegistrationConflictError(registry, item.id);
      }
      order += 1;
      version += 1;
      sorted = null;
      entries.set(item.id, { item, order });
    },
    replace(item) {
      const entry = entries.get(item.id);
      if (!entry) {
        throw new UnknownRegistrationError(registry, item.id);
      }
      version += 1;
      sorted = null;
      entries.set(item.id, { item, order: entry.order });
      return entry.item;
    },
    has: (id) => entries.has(id),
    require(id) {
      const entry = entries.get(id);
      if (!entry) {
        throw new UnknownRegistrationError(registry, id);
      }
      return entry.item;
    },
    ordered() {
      sorted ??= [...entries.values()]
        .sort(
          (left, right) =>
            (compare ? compare(left.item, right.item) : 0) ||
            left.order - right.order,
        )
        .map((entry) => entry.item);
      return sorted;
    },
    get version() {
      return version;
    },
  };
}
