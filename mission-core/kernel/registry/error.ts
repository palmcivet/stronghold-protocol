export class UnknownRegistrationError extends Error {
  readonly registry: string;
  readonly id: string;
  /** 引用这个 id 的地方，例如单位规格。 */
  readonly owner: string | undefined;

  constructor(registry: string, id: string, owner?: string) {
    super(
      owner === undefined
        ? `${registry} 未注册: ${id}`
        : `${registry} 未注册: ${id}（${owner}）`,
    );
    this.name = 'UnknownRegistrationError';
    this.registry = registry;
    this.id = id;
    this.owner = owner;
  }
}

/** 同一张表里同一个 id 注册了两次。只有标成可扩展的 id 能经 replace 或 wrap 换掉。 */
export class RegistrationConflictError extends Error {
  readonly registry: string;
  readonly id: string;

  constructor(registry: string, id: string) {
    super(`${registry} 重复注册: ${id}`);
    this.name = 'RegistrationConflictError';
    this.registry = registry;
    this.id = id;
  }
}

/** replace 或 wrap 一个没有标成可扩展的 id，或者给出的契约版本与标记的不一致。 */
export class ExtensionRefusedError extends Error {
  readonly registry: string;
  readonly id: string;

  constructor(registry: string, id: string, reason: string) {
    super(`${registry} "${id}" cannot be extended: ${reason}`);
    this.name = 'ExtensionRefusedError';
    this.registry = registry;
    this.id = id;
  }
}
