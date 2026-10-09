import { readFile, stat } from "node:fs/promises"
import type { IncomingMessage, ServerResponse } from "node:http"
import { extname, join, normalize, resolve, sep } from "node:path"
import { emptyLocalManifest } from "arknights-assets-catalog"
import type { ViteDevServer } from "vite"

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".atlas": "text/plain",
  ".css": "text/css",
  ".json": "application/json",
  ".js": "text/javascript",
  ".mp3": "audio/mpeg",
  ".otf": "font/otf",
  ".png": "image/png",
  ".skel": "application/octet-stream",
  ".ttf": "font/ttf",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
}

const LOCAL_MANIFEST_PATH = "/res/local/manifest.json"

export interface DevResourcesOptions {
  /** `app/data/product`: base and season packs. */
  readonly productDir: string
  /** `app/data/.cache/derived`: files derived by `app/data`, these win over extracted files. */
  readonly derivedDir: string
  /** `app/data/.cache/assets/files`: files written by `assets-extractor`. */
  readonly extractedFilesDir: string
  /** `app/client/local`: the local overlay manifest and its files. */
  readonly localDir: string
}

/** A file location as a root and a path under it. */
type Target = readonly [root: string, relative: string]

interface Route {
  readonly pattern: RegExp
  /** Candidate files in priority order, built from the capture groups of `pattern`. */
  readonly targets: (groups: readonly string[]) => readonly Target[]
}

function underRoot(root: string, relative: string): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(relative)
  } catch {
    return null
  }
  const file = normalize(join(root, decoded))
  return file.startsWith(`${root}${sep}`) ? file : null
}

async function statFile(file: string): Promise<{ readonly file: string, readonly size: number } | null> {
  try {
    const info = await stat(file)
    return info.isFile() ? { file, size: info.size } : null
  } catch {
    return null
  }
}

async function firstFile(files: readonly string[]): Promise<{ readonly file: string, readonly size: number } | null> {
  for (const file of files) {
    const found = await statFile(file)
    if (found) return found
  }
  return null
}

function contentType(file: string): string {
  return CONTENT_TYPES[extname(file).toLowerCase()] ?? "application/octet-stream"
}

async function sendFile(method: string, response: ServerResponse, found: { readonly file: string, readonly size: number }): Promise<void> {
  response.statusCode = 200
  response.setHeader("Content-Type", contentType(found.file))
  response.setHeader("Content-Length", found.size)
  if (method === "HEAD") {
    response.end()
    return
  }
  response.end(await readFile(found.file))
}

function sendJson(method: string, response: ServerResponse, value: unknown): void {
  const body = JSON.stringify(value)
  response.statusCode = 200
  response.setHeader("Content-Type", CONTENT_TYPES[".json"] ?? "application/json")
  response.setHeader("Content-Length", Buffer.byteLength(body))
  if (method === "HEAD") {
    response.end()
    return
  }
  response.end(body)
}

export function devResourcesPlugin(options: DevResourcesOptions) {
  const productDir = resolve(options.productDir)
  const derivedDir = resolve(options.derivedDir)
  const extractedFilesDir = resolve(options.extractedFilesDir)
  const localDir = resolve(options.localDir)
  const seasonDir = (seasonId: string): string => join(productDir, "season", seasonId)

  // MARK: routes

  const routes: readonly Route[] = [
    {
      pattern: /^\/res\/files\/(.+)$/,
      targets: ([address = ""]) => [[derivedDir, address], [extractedFilesDir, address]],
    },
    {
      pattern: /^\/res\/packs\/base\/[^/]+\/(.+)$/,
      targets: ([file = ""]) => [[join(productDir, "base"), file]],
    },
    {
      pattern: /^\/res\/packs\/season\/([^/]+)\/[^/]+\/(.+)$/,
      targets: ([seasonId = "", file = ""]) => [[seasonDir(seasonId), file]],
    },
    {
      pattern: /^\/res\/local\/manifest\.json$/,
      targets: () => [[localDir, "manifest.json"]],
    },
    {
      pattern: /^\/data\/seasons\/([^/]+)\/(.+)$/,
      targets: ([seasonId = "", file = ""]) => [[seasonDir(seasonId), file]],
    },
  ]

  /** Files a path may be served from, or null when no route matches or the path leaves its root. */
  function candidateFiles(pathname: string): readonly string[] | null {
    for (const route of routes) {
      const match = route.pattern.exec(pathname)
      if (!match) continue
      const files: string[] = []
      for (const [root, relative] of route.targets(match.slice(1))) {
        const file = underRoot(root, relative)
        if (file === null) return null
        files.push(file)
      }
      return files
    }
    return null
  }

  return {
    name: "development-resources",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
        if (request.method !== "GET" && request.method !== "HEAD") {
          return next()
        }
        const method = request.method
        const pathname = new URL(request.url || "/", "http://localhost").pathname
        const files = candidateFiles(pathname)
        if (!files) {
          return next()
        }
        const found = await firstFile(files)
        if (found) {
          try {
            return await sendFile(method, response, found)
          } catch {
            return next()
          }
        }
        if (pathname === LOCAL_MANIFEST_PATH) {
          return sendJson(method, response, emptyLocalManifest())
        }
        next()
      })
    },
  }
}
