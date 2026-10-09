export class BuildReadError extends Error {
  readonly path: string
  constructor(path: string, message: string) {
    super(message)
    this.name = "BuildReadError"
    this.path = path
  }
}
