import { ExtensionRefusedError } from '#kernel/registry/error.js';

/** 可扩展 id 的契约：哪一张注册表，以及替换项要满足的版本。 */
export interface ExtensibleOptions<C extends string = string> {
  /** 契约版本。替换项给出的版本必须与标记时的一致。 */
  readonly version: number;
  /** 注册表的名字，例如 skill-trigger。 */
  readonly contract: C;
}

/** defineExtensible 返回的键。只是数据：同样的 id、契约与版本得到相等的键。 */
export interface ExtensibleKey<C extends string = string>
  extends ExtensibleOptions<C> {
  readonly id: string;
}

export type ExtensionKind = 'replace' | 'wrap';

/** 替换链上的一环。by 是做这次替换的模块 id，引擎自己的是 core。 */
export interface ExtensionRecord {
  readonly contract: string;
  readonly id: string;
  readonly version: number;
  readonly kind: ExtensionKind;
  readonly by: string;
}

/** 标出一个允许 replace 与 wrap 的注册 id。 */
export function defineExtensible<C extends string>(
  id: string,
  options: ExtensibleOptions<C>,
): ExtensibleKey<C> {
  if (id.length === 0) {
    throw new Error('extensible id must not be empty');
  }
  if (!Number.isInteger(options.version) || options.version < 1) {
    throw new Error(
      `extensible version must be a positive integer: ${id} ${options.version}`,
    );
  }
  return Object.freeze({
    id,
    version: options.version,
    contract: options.contract,
  });
}

/** 一场战斗里标过的可扩展 id 与替换链。 */
export interface ExtensibleCatalog {
  mark(key: ExtensibleKey): void;
  /** 按标记检查这次替换并记进替换链。 */
  extend(key: ExtensibleKey, kind: ExtensionKind, by: string): void;
  isMarked(contract: string, id: string): boolean;
  /** 按发生顺序的替换链。 */
  chain(): readonly ExtensionRecord[];
}

export function createExtensibleCatalog(): ExtensibleCatalog {
  const marks = new Map<string, ExtensibleKey>();
  const chain: ExtensionRecord[] = [];
  const slot = (contract: string, id: string): string =>
    `${contract}\u0000${id}`;
  return {
    mark(key) {
      const existing = marks.get(slot(key.contract, key.id));
      if (existing && existing.version !== key.version) {
        throw new ExtensionRefusedError(
          key.contract,
          key.id,
          `marked with version ${existing.version}, not ${key.version}`,
        );
      }
      marks.set(slot(key.contract, key.id), key);
    },
    extend(key, kind, by) {
      const marked = marks.get(slot(key.contract, key.id));
      if (!marked) {
        throw new ExtensionRefusedError(
          key.contract,
          key.id,
          'not marked extensible',
        );
      }
      if (marked.version !== key.version) {
        throw new ExtensionRefusedError(
          key.contract,
          key.id,
          `contract version is ${marked.version}, got ${key.version}`,
        );
      }
      chain.push({
        contract: key.contract,
        id: key.id,
        version: key.version,
        kind,
        by,
      });
    },
    isMarked: (contract, id) => marks.has(slot(contract, id)),
    chain: () => chain.slice(),
  };
}
