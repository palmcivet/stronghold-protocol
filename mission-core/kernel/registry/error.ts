export class UnknownRegistrationError extends Error {
  readonly registry: string
  readonly id: string
  /** 引用这个 id 的地方，例如单位规格。 */
  readonly owner: string | undefined

  constructor(registry: string, id: string, owner?: string) {
    super(owner === undefined ? `${registry} 未注册: ${id}` : `${registry} 未注册: ${id}（${owner}）`)
    this.name = "UnknownRegistrationError"
    this.registry = registry
    this.id = id
    this.owner = owner
  }
}

/** 同一张表里同一个 id 注册了两次，而这张表不允许替换。 */
export class RegistrationConflictError extends Error {
  readonly registry: string
  readonly id: string

  constructor(registry: string, id: string) {
    super(`${registry} 重复注册: ${id}`)
    this.name = "RegistrationConflictError"
    this.registry = registry
    this.id = id
  }
}
