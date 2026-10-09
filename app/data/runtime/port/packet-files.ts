export interface PacketFiles {
  readText(path: string): Promise<string>
  readDir(path: string): Promise<readonly string[]>
}

export class PacketReadError extends Error {
  readonly path: string
  constructor(path: string, message: string) {
    super(message)
    this.name = "PacketReadError"
    this.path = path
  }
}
