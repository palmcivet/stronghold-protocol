export class UnknownRegistrationError extends Error {
  readonly registry: string
  readonly id: string

  constructor(registry: string, id: string) {
    super(`${registry} 未注册: ${id}`)
    this.name = "UnknownRegistrationError"
    this.registry = registry
    this.id = id
  }
}
