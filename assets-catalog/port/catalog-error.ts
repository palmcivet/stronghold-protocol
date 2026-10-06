export class CatalogReadError extends Error {
  readonly path: string
  constructor(path: string, message: string) {
    super(message)
    this.name = "CatalogReadError"
    this.path = path
  }
}
