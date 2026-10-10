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
