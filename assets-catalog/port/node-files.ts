import { access, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { CatalogReadError } from "./catalog-error.js"
import type { CatalogFiles } from "./catalog-files.js"

function fail(path: string, cause: unknown): never {
  throw new CatalogReadError(path, cause instanceof Error ? cause.message : String(cause))
}

export const nodeCatalogFiles: CatalogFiles = {
  async readText(path) {
    try {
      return await readFile(path, "utf8")
    } catch (cause) {
      fail(path, cause)
    }
  },
  async readBytes(path) {
    try {
      return new Uint8Array(await readFile(path))
    } catch (cause) {
      fail(path, cause)
    }
  },
  async writeTextAtomic(path, text) {
    try {
      await mkdir(dirname(path), { recursive: true })
      const temporary = `${path}.tmp-${process.pid}`
      await writeFile(temporary, text)
      await rename(temporary, path)
    } catch (cause) {
      fail(path, cause)
    }
  },
  async exists(path) {
    try {
      await access(path)
      return true
    } catch {
      return false
    }
  },
  async readDir(path) {
    try {
      const entries = await readdir(path, { withFileTypes: true })
      return entries
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    } catch (cause) {
      fail(path, cause)
    }
  },
}
