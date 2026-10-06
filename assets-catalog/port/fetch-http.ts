import { CatalogReadError } from "./catalog-error.js"
import type { CatalogHttp } from "./catalog-http.js"

function fail(path: string, cause: unknown): never {
  throw new CatalogReadError(path, cause instanceof Error ? cause.message : String(cause))
}

async function responseOf(url: string, timeoutMs: number): Promise<Response> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return res
}

export const fetchCatalogHttp: CatalogHttp = {
  async getText(url, timeoutMs) {
    try {
      return await (await responseOf(url, timeoutMs)).text()
    } catch (cause) {
      fail(url, cause)
    }
  },
  async getBytes(url, timeoutMs) {
    try {
      return new Uint8Array(await (await responseOf(url, timeoutMs)).arrayBuffer())
    } catch (cause) {
      fail(url, cause)
    }
  },
}
