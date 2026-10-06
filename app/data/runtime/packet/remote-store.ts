import { packetAddress, packetFiles, type PacketName } from "#schema/packet-file.js"

export const packetRetryDelaysMs = [600, 2000] as const
export const artManifestTimeoutMs = 8000

const artManifests = new Set<PacketName>(["local", "assets"])

export type PacketStatus = "idle" | "loading" | "ready" | "missing"

export interface PacketResponse {
  readonly ok: boolean
  readonly status: number
  json(): Promise<unknown>
}

export interface PacketFetch {
  (url: string, init: { readonly cache: "no-cache" }): Promise<PacketResponse>
}

export interface RemotePacketStore {
  load(name: PacketName): Promise<unknown>
  loadAll(names: readonly PacketName[]): Promise<readonly unknown[]>
  get(name: PacketName): unknown
  status(name: PacketName): PacketStatus
  lookup(name: PacketName, id: string): unknown
  list(name: PacketName): readonly unknown[]
  invalidate(name: PacketName): Promise<unknown>
  subscribe(listener: (name: PacketName) => void): () => void
}

interface StoreOptions {
  readonly seasonId: string
  readonly fetch?: PacketFetch
  readonly retryDelays?: readonly number[]
  readonly wait?: (ms: number) => Promise<void>
  readonly timeoutMs?: number
  readonly setTimeout?: (fn: () => void, ms: number) => unknown
  readonly clearTimeout?: (timer: unknown) => void
}

interface LoadFailure extends Error {
  status?: number | null
  badJson?: boolean
  timeout?: boolean
}

interface PacketSlot {
  status: "loading" | "ready" | "missing"
  promise: Promise<unknown>
  value: unknown
  index: Map<string, unknown> | null
}

function idOf(record: unknown): string | null {
  const map = record !== null && typeof record === "object" && !Array.isArray(record) ? record as Record<string, unknown> : null
  if (!map) return null
  for (const key of ["id", "chessId", "bondId", "itemId", "bandId", "enemyKey", "enemyId", "stageId", "bossId", "tokenId", "choiceId", "key"]) {
    const value = map[key]
    if (typeof value === "string" && value) return value
    if (typeof value === "number" && Number.isFinite(value)) return String(value)
  }
  return null
}

function indexDocument(json: unknown): Map<string, unknown> {
  const map = new Map<string, unknown>()
  if (Array.isArray(json)) {
    for (const record of json) {
      const id = idOf(record)
      if (id !== null && !map.has(id)) map.set(id, record)
    }
    return map
  }
  if (json !== null && typeof json === "object") {
    for (const [key, value] of Object.entries(json)) {
      if (value !== null && typeof value === "object") map.set(key, value)
    }
  }
  return map
}

function transientFailure(error: LoadFailure): boolean {
  if (error.badJson) return false
  const status = error.status
  return !(Number.isInteger(status) && status !== undefined && status !== null && status >= 400 && status < 500 && status !== 408 && status !== 429)
}

export function createRemotePacketStore(options: StoreOptions): RemotePacketStore {
  const loadJson: PacketFetch = options.fetch ?? ((url, init) => globalThis.fetch(url, init) as Promise<PacketResponse>)
  const retryDelays = options.retryDelays ?? packetRetryDelaysMs
  const wait = options.wait ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)))
  const timeoutMs = options.timeoutMs === undefined ? artManifestTimeoutMs : options.timeoutMs
  const armTimer = options.setTimeout ?? ((fn: () => void, ms: number) => setTimeout(fn, ms))
  const disarmTimer = options.clearTimeout ?? ((timer: unknown) => clearTimeout(timer as ReturnType<typeof setTimeout>))
  const entries = new Map<PacketName, PacketSlot>()
  const listeners = new Set<(name: PacketName) => void>()
  const warned = new Set<PacketName>()

  const notify = (name: PacketName): void => {
    for (const listener of [...listeners]) {
      try {
        listener(name)
      } catch (error) {
        console.error("[packet] listener failed", error)
      }
    }
  }

  const urlFor = (name: PacketName): string => packetAddress(options.seasonId, name)

  const readJson = (name: PacketName): Promise<unknown> => {
    const run = async (): Promise<unknown> => {
      const response = await loadJson(urlFor(name), { cache: "no-cache" })
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`) as LoadFailure
        error.status = response.status
        throw error
      }
      try {
        return await response.json()
      } catch (cause) {
        const error = (cause instanceof Error ? cause : new Error(String(cause))) as LoadFailure
        error.badJson = true
        throw error
      }
    }
    if (!artManifests.has(name) || !(timeoutMs > 0)) return run()
    let timer: unknown = null
    let done = false
    const finish = (): boolean => {
      if (done) return false
      done = true
      if (timer !== null) disarmTimer(timer)
      return true
    }
    const timed = new Promise<never>((_resolve, reject) => {
      timer = armTimer(() => {
        if (!finish()) return
        const error = new Error("timeout") as LoadFailure
        error.timeout = true
        reject(error)
      }, timeoutMs)
    })
    const request = run().then(
      (json) => {
        finish()
        return json
      },
      (error: unknown) => {
        finish()
        throw error
      },
    )
    return Promise.race([request, timed])
  }

  const load = (name: PacketName): Promise<unknown> => {
    const current = entries.get(name)
    if (current) return current.promise
    const slot: PacketSlot = { status: "loading", promise: Promise.resolve(null), value: null, index: null }
    const art = artManifests.has(name)
    slot.promise = (async () => {
      let toldMissing = false
      for (let attempt = 0; ; attempt += 1) {
        try {
          slot.value = await readJson(name)
          slot.status = "ready"
          break
        } catch (cause) {
          const error = (cause instanceof Error ? cause : new Error(String(cause))) as LoadFailure
          const stillCurrent = entries.get(name) === slot
          const again = transientFailure(error) && attempt < retryDelays.length && stillCurrent
          if (art && stillCurrent && slot.status !== "missing") {
            slot.value = null
            slot.index = null
            slot.status = "missing"
            toldMissing = true
            notify(name)
          }
          if (again) {
            const delay = retryDelays[attempt]
            if (delay !== undefined) await wait(delay)
            if (entries.get(name) === slot) continue
            break
          }
          if (stillCurrent) {
            if (!warned.has(name)) {
              warned.add(name)
              console.warn(`[packet] ${urlFor(name)} unavailable (${error.message}); continuing without it`)
            }
            slot.value = null
            slot.index = null
            slot.status = "missing"
          }
          break
        }
      }
      if (entries.get(name) === slot && !(toldMissing && slot.status === "missing")) notify(name)
      return slot.value
    })()
    entries.set(name, slot)
    return slot.promise
  }

  const indexOf = (name: PacketName): Map<string, unknown> | null => {
    const slot = entries.get(name)
    if (!slot || slot.status !== "ready") return null
    slot.index ??= indexDocument(slot.value)
    return slot.index
  }

  return {
    load,
    loadAll: (names) => Promise.all(names.map((name) => load(name))),
    get: (name) => entries.get(name)?.value ?? null,
    status: (name) => entries.get(name)?.status ?? "idle",
    lookup: (name, id) => indexOf(name)?.get(id) ?? null,
    list: (name) => [...(indexOf(name)?.values() ?? [])],
    invalidate: (name) => {
      if (!entries.has(name)) return Promise.resolve(null)
      entries.delete(name)
      warned.delete(name)
      const promise = load(name)
      notify(name)
      return promise
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export function packetFileName(name: PacketName): string {
  return packetFiles[name]
}
