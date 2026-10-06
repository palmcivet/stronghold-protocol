export interface CatalogHttp {
  getText(url: string, timeoutMs: number): Promise<string>
  getBytes(url: string, timeoutMs: number): Promise<Uint8Array>
}
