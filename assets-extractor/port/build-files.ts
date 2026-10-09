export interface BuildFiles {
  readText(path: string): Promise<string>
  readBytes(path: string): Promise<Uint8Array>
  writeTextAtomic(path: string, text: string): Promise<void>
  writeBytesAtomic(path: string, bytes: Uint8Array): Promise<void>
  exists(path: string): Promise<boolean>
  readDir(path: string): Promise<readonly string[]>
}
