import { validSpine, type SpineFile } from "./spine-file.js"

/** 场景还在时，空闲骨架允许占用的估算字节。 */
export const spineIdleBytes: number = 48 * 1024 * 1024
/** 释放之后这段时间不受字节预算淘汰，够一次整备和战斗来回。 */
export const spineIdleGraceMs: number = 15000
/** 释放后延迟这么久再集中淘汰，避免一场切换里拆掉马上又要的模型。 */
export const spineEvictDelayMs: number = 1000
/** 没有任何引用、也没有场景守着缓存，持续这么久才算安静。 */
export const spineQuietDelayMs: number = 3000
/** 认不出的骨架至少按这个重量计。 */
export const spineWeightMin: number = 64 * 1024

const objectBytes = 96
const numberBytes = 8
const structureNames = ["bones", "slots", "events", "ikConstraints", "transformConstraints", "pathConstraints"] as const
const attachmentFields = ["vertices", "regionUVs", "uvs", "triangles", "bones", "edges", "lengths", "offset"] as const

function read(value: object, key: string): unknown {
  if (!Object.hasOwn(value, key)) return undefined
  return (value as Record<string, unknown>)[key]
}

function asList(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : []
}

function arrayBytes(value: unknown): number {
  if (!value || typeof value !== "object") return 0
  if (ArrayBuffer.isView(value)) return value.byteLength + objectBytes
  if (Array.isArray(value)) return value.length * numberBytes + objectBytes
  return 0
}

/**
 * 估算一份已解析骨架占的堆内存。网格、时间轴和变形帧按数组计，每个对象再加一块固定开销。
 * 数到一半形状不对就停，结果不会低于 `spineWeightMin`。
 */
export function spineDataWeight(data: unknown): number {
  if (!data || typeof data !== "object") return spineWeightMin
  let weight = 0
  try {
    for (const name of structureNames) weight += asList(read(data, name)).length * objectBytes * 2
    for (const skin of asList(read(data, "skins"))) {
      if (!skin || typeof skin !== "object") continue
      for (const slot of asList(read(skin, "attachments"))) {
        if (!slot || typeof slot !== "object") continue
        for (const attachment of Object.values(slot)) {
          weight += objectBytes * 2
          if (!attachment || typeof attachment !== "object") continue
          for (const name of attachmentFields) weight += arrayBytes(read(attachment, name))
        }
      }
    }
    for (const animation of asList(read(data, "animations"))) {
      weight += objectBytes
      if (!animation || typeof animation !== "object") continue
      for (const timeline of asList(read(animation, "timelines"))) {
        if (!timeline || typeof timeline !== "object") continue
        weight += objectBytes
        weight += arrayBytes(read(timeline, "frames"))
        weight += arrayBytes(read(timeline, "curves"))
        weight += arrayBytes(read(timeline, "attachmentNames"))
        weight += arrayBytes(read(timeline, "events"))
        for (const frame of asList(read(timeline, "frameVertices"))) weight += arrayBytes(frame)
        for (const order of asList(read(timeline, "drawOrders"))) weight += arrayBytes(order)
      }
    }
  } catch {
    // 形状超出 SkeletonData 时保留已经数过的部分
  }
  return Math.max(spineWeightMin, weight)
}

/** 图集页地址。有 textures 用它，否则是骨架旁边的同名 png。 */
export function spinePages(file: SpineFile): readonly string[] {
  const listed = file.textures?.filter((url) => url.length > 0) ?? []
  if (listed.length > 0) return listed
  return [file.skel.replace(/\.skel$/, ".png")]
}

// MARK: ref cache

export type RefState = "loading" | "ready" | "failed"

export interface RefSettle<T> {
  resolve: (value: T) => void
  reject: (error: unknown) => void
}

export interface RefEntry<T> {
  readonly key: string
  promise: Promise<T>
  value: T | null
  state: RefState
  refs: number
  used: number
  weight: number
  idleSince: number | null
  error: unknown
  failedAt: number | null
  attempt: number
  abort: (() => void) | null
  settle: RefSettle<T> | null
}

export interface RefLoadOptions {
  readonly fresh: true
}

export interface RefTimers {
  set: (fn: () => void, ms: number) => unknown
  clear: (timer: unknown) => void
}

export interface RefStats {
  readonly size: number
  readonly ready: number
  readonly loading: number
  readonly failed: number
  readonly refs: number
  readonly holds: number
  readonly weight: number
  readonly idleWeight: number
  readonly active: number
  readonly queued: number
  readonly unloading: number
}

export interface RefLruOptions<T, A> {
  readonly load: (key: string, arg: A, options?: RefLoadOptions) => T | Promise<T>
  readonly unload?: (key: string, value: T | null, record: RefEntry<T>) => void | Promise<void>
  readonly max?: number
  readonly timeout?: number
  readonly concurrency?: number
  readonly failTtl?: number
  readonly now?: () => number
  readonly weigh?: (key: string, value: T, arg: A) => number
  readonly maxIdleWeight?: number
  readonly quietWeight?: number
  readonly idleGrace?: number
  readonly quietDelay?: number
  readonly evictDelay?: number
  readonly timers?: RefTimers
}

interface RefSweep {
  timer: unknown
  at: number
}

function budgetOf(value: number | undefined, fallback: number): number {
  return typeof value === "number" && value >= 0 ? value : fallback
}

function defaultTimers(): RefTimers {
  return {
    set: (fn, ms) => {
      const timer = setTimeout(fn, ms)
      timer.unref()
      return timer
    },
    clear: (timer) => {
      clearTimeout(timer as ReturnType<typeof setTimeout>)
    },
  }
}

/**
 * 引用计数缓存。有引用的值不淘汰。空闲值先受条数限制，再受空闲字节预算限制；
 * 安静一段时间之后改用更小的安静预算。`hold` 期间不算安静。
 * 卸载还没结束的键不会再次把旧值交出去，新的加载会等那次卸载落定。
 * 同一次加载里先成功的那次生效；失败只认最新一次尝试。
 */
export class RefLru<T, A = unknown> {
  readonly max: number
  readonly timeout: number
  readonly concurrency: number
  readonly failTtl: number
  readonly now: () => number
  readonly maxIdleWeight: number
  readonly quietWeight: number
  readonly idleGrace: number
  readonly quietDelay: number
  readonly evictDelay: number
  readonly map: Map<string, RefEntry<T>> = new Map()

  private readonly loadValue: (key: string, arg: A, options?: RefLoadOptions) => T | Promise<T>
  private readonly unloadValue: (key: string, value: T | null, record: RefEntry<T>) => void | Promise<void>
  private readonly weigh: ((key: string, value: T, arg: A) => number) | null
  private readonly timers: RefTimers
  private sweepAt: RefSweep | null = null
  private refs: number = 0
  private holds: number = 0
  private quietAt: number | null
  private readonly pendingUnloads: Map<string, Promise<void>> = new Map()
  private active: number = 0
  private readonly queue: Array<() => void> = []
  private tick: number = 0

  constructor(options: RefLruOptions<T, A>) {
    if (!options || typeof options.load !== "function") throw new TypeError("RefLru: load required")
    this.loadValue = options.load
    this.unloadValue = options.unload ?? (() => {})
    this.max = Math.max(1, (options.max ?? 60) | 0)
    this.timeout = options.timeout ?? 20000
    this.concurrency = Math.max(1, (options.concurrency ?? 6) | 0)
    this.failTtl = options.failTtl ?? 60000
    this.now = options.now ?? (() => Date.now())
    this.weigh = options.weigh ?? null
    this.maxIdleWeight = budgetOf(options.maxIdleWeight, Number.POSITIVE_INFINITY)
    this.quietWeight = budgetOf(options.quietWeight, this.maxIdleWeight)
    this.idleGrace = budgetOf(options.idleGrace, 0)
    this.quietDelay = budgetOf(options.quietDelay, 0)
    this.evictDelay = budgetOf(options.evictDelay, 0)
    this.timers = options.timers ?? defaultTimers()
    this.quietAt = this.now()
  }

  /** 已就绪的值。不改变引用计数。 */
  peek(key: string): T | null {
    const entry = this.map.get(key)
    if (!entry || entry.state !== "ready") return null
    return entry.value
  }

  has(key: string): boolean {
    return this.map.has(key)
  }

  get size(): number {
    return this.map.size
  }

  /**
   * 取得一次引用，用完要 `release`。`retry` 时，已经没人引用的失败记录会丢掉重载；
   * 还有人引用的失败记录继续共用，避免旧的 release 打到新记录上。
   * 超过失败保留时间的记录会换一条新的，即使旧记录上还有引用。
   */
  acquire(key: string, arg: A, options?: { readonly retry?: boolean }): Promise<T> {
    let entry = this.map.get(key) ?? null
    let fresh = false
    if (
      entry &&
      entry.state === "failed" &&
      entry.failedAt !== null &&
      (this.now() - entry.failedAt > this.failTtl || (options?.retry === true && entry.refs === 0))
    ) {
      this.map.delete(key)
      entry = null
      fresh = true
    }
    if (!entry) {
      entry = this.begin(key)
      this.map.set(key, entry)
      this.attempt(entry, key, arg, fresh)
    }
    entry.refs += 1
    this.refs += 1
    this.quietAt = null
    entry.idleSince = null
    entry.used = ++this.tick
    return entry.promise
  }

  /** 还在加载时再开一次尝试。引用和大家正在等的 promise 不变。不是加载中则返回 false。 */
  restart(key: string, arg: A): boolean {
    const entry = this.map.get(key)
    if (!entry || entry.state !== "loading" || !entry.settle) return false
    this.attempt(entry, key, arg, true)
    return true
  }

  /** 放掉一次引用，不会低于 0。多出来的 release 仍会把记录标成最近使用并安排淘汰。 */
  release(key: string): void {
    const entry = this.map.get(key)
    if (!entry) return
    if (entry.refs > 0) {
      entry.refs -= 1
      if (entry.refs === 0) entry.idleSince = this.now()
      this.refs -= 1
      if (this.refs <= 0) {
        this.refs = 0
        if (this.holds === 0) this.quietAt = this.now()
      }
    }
    entry.used = ++this.tick
    this.requestEvict()
  }

  /** 场景马上还会再用这些值。返回的函数只能生效一次，安静计时从那时重新开始。 */
  hold(): () => void {
    this.holds += 1
    this.quietAt = null
    let held = true
    return () => {
      if (!held) return
      held = false
      this.holds -= 1
      if (this.holds <= 0) {
        this.holds = 0
        if (this.refs === 0) this.quietAt = this.now()
      }
      this.requestEvict()
    }
  }

  /** 这个键的卸载 promise 是否还在。 */
  unloading(key: string): boolean {
    return this.pendingUnloads.has(key)
  }

  /** 全部卸掉。场景的 hold 还在。 */
  clear(): void {
    if (this.sweepAt) {
      this.timers.clear(this.sweepAt.timer)
      this.sweepAt = null
    }
    const all = [...this.map.values()]
    this.map.clear()
    this.refs = 0
    this.quietAt = this.holds > 0 ? null : this.now()
    for (const entry of all) {
      if (entry.state === "ready") this.unloadNow(entry.key, entry.value, entry)
    }
  }

  stats(): RefStats {
    let ready = 0
    let loading = 0
    let failed = 0
    let refs = 0
    let weight = 0
    let idleWeight = 0
    for (const entry of this.map.values()) {
      if (entry.state === "ready") ready += 1
      else if (entry.state === "loading") loading += 1
      else failed += 1
      refs += entry.refs
      weight += entry.weight || 0
      if (entry.refs === 0) idleWeight += entry.weight || 0
    }
    return {
      size: this.map.size,
      ready,
      loading,
      failed,
      refs,
      holds: this.holds,
      weight,
      idleWeight,
      active: this.active,
      queued: this.queue.length,
      unloading: this.pendingUnloads.size,
    }
  }

  private begin(key: string): RefEntry<T> {
    const settle: { current: RefSettle<T> | null } = { current: null }
    const promise = new Promise<T>((resolve, reject) => {
      settle.current = { resolve, reject }
    })
    promise.catch(() => {})
    return {
      key,
      promise,
      value: null,
      state: "loading",
      refs: 0,
      used: ++this.tick,
      weight: 0,
      idleSince: null,
      error: null,
      failedAt: null,
      attempt: 0,
      abort: null,
      settle: settle.current,
    }
  }

  /** 第一次成功定案。被替换掉的尝试，失败不算；成功如果来晚了，也不再卸掉那份资源。 */
  private attempt(entry: RefEntry<T>, key: string, arg: A, fresh: boolean): void {
    const attempt = ++entry.attempt
    const abort = entry.abort
    entry.abort = null
    if (abort) abort()
    const start = (): Promise<T> => {
      const pending = this.pendingUnloads.get(key)
      const go = (): Promise<T> => {
        const loaded = fresh ? this.loadValue(key, arg, { fresh: true }) : this.loadValue(key, arg)
        return Promise.resolve(loaded)
      }
      return pending ? pending.then(go) : go()
    }
    const run = (): Promise<T> => {
      if (attempt !== entry.attempt) return Promise.reject(new Error(`load superseded: ${key}`))
      return this.withTimeout(start(), key, (cancel) => {
        if (attempt === entry.attempt) entry.abort = cancel
      })
    }
    void this.schedule(run).then(
      (value) => {
        this.accept(entry, key, arg, value)
      },
      (error: unknown) => {
        this.rejectAttempt(entry, attempt, error)
      },
    )
  }

  private accept(entry: RefEntry<T>, key: string, arg: A, value: T): void {
    const settle = entry.settle
    if (!settle) return
    entry.settle = null
    entry.abort = null
    if (this.map.get(key) !== entry) {
      this.unloadNow(key, value, entry)
      settle.resolve(value)
      return
    }
    entry.value = value
    entry.state = "ready"
    if (this.weigh) {
      let weight = 0
      try {
        weight = Number(this.weigh(key, value, arg))
      } catch {
        weight = 0
      }
      entry.weight = weight > 0 ? weight : 0
    }
    this.requestEvict()
    settle.resolve(value)
  }

  private rejectAttempt(entry: RefEntry<T>, attempt: number, error: unknown): void {
    const settle = entry.settle
    if (!settle || attempt !== entry.attempt) return
    entry.settle = null
    entry.abort = null
    entry.state = "failed"
    entry.error = error
    entry.failedAt = this.now()
    settle.reject(error)
  }

  private requestEvict(): void {
    if (this.evictDelay > 0) this.sweepIn(this.evictDelay)
    else this.evict()
  }

  /**
   * 先按条数丢掉最久未用、且不在加载中的无引用记录，再按字节丢掉过了宽限的空闲就绪值。
   * 没有任何引用和 hold、并且安静时间已到时，预算换成 quietWeight。
   */
  private evict(): void {
    if (this.map.size > this.max) {
      const idle = [...this.map.values()]
        .filter((entry) => entry.refs === 0 && entry.state !== "loading")
        .sort((left, right) => left.used - right.used)
      for (const entry of idle) {
        if (this.map.size <= this.max) break
        this.drop(entry)
      }
    }
    if (!this.weigh) return
    let idleWeight = 0
    const idle: RefEntry<T>[] = []
    for (const entry of this.map.values()) {
      if (entry.refs === 0 && entry.state === "ready") {
        idleWeight += entry.weight
        idle.push(entry)
      }
    }
    const now = this.now()
    let budget = this.maxIdleWeight
    let wait = Number.POSITIVE_INFINITY
    if (this.refs === 0 && this.holds === 0) {
      const quietFor = now - (this.quietAt ?? now)
      if (quietFor >= this.quietDelay) budget = this.quietWeight
      else if (idleWeight > this.quietWeight) wait = this.quietDelay - quietFor
    }
    if (idleWeight > budget) {
      idle.sort((left, right) => left.used - right.used)
      let graceWait = Number.POSITIVE_INFINITY
      for (const entry of idle) {
        if (idleWeight <= budget) break
        const age = now - (entry.idleSince ?? now)
        if (age < this.idleGrace) {
          graceWait = Math.min(graceWait, this.idleGrace - age)
          continue
        }
        idleWeight -= entry.weight
        this.drop(entry)
      }
      if (idleWeight > budget) wait = Math.min(wait, graceWait)
    }
    if (wait < Number.POSITIVE_INFINITY) this.sweepIn(wait)
  }

  private drop(entry: RefEntry<T>): void {
    this.map.delete(entry.key)
    if (entry.state === "ready") this.unloadNow(entry.key, entry.value, entry)
  }

  /** 卸载返回的 promise 还在时，这个键的下一次加载会等它。 */
  private unloadNow(key: string, value: T | null, record: RefEntry<T>): void {
    let result: void | Promise<void>
    try {
      result = this.unloadValue(key, value, record)
    } catch {
      return
    }
    if (!result || typeof result.then !== "function") return
    let done: Promise<void> = Promise.resolve()
    done = Promise.resolve(result).then(
      () => {},
      () => {},
    ).then(() => {
      if (this.pendingUnloads.get(key) === done) this.pendingUnloads.delete(key)
    })
    this.pendingUnloads.set(key, done)
  }

  /** 保留更早的那次清扫。 */
  private sweepIn(ms: number): void {
    const at = this.now() + ms
    if (this.sweepAt && this.sweepAt.at <= at) return
    if (this.sweepAt) this.timers.clear(this.sweepAt.timer)
    const timer = this.timers.set(() => {
      this.sweepAt = null
      this.evict()
    }, Math.ceil(ms) + 5)
    this.sweepAt = { timer, at }
  }

  private schedule<R>(fn: () => R | Promise<R>): Promise<R> {
    return new Promise((resolve, reject) => {
      const run = (): void => {
        this.active += 1
        let pending: Promise<R>
        try {
          pending = Promise.resolve(fn())
        } catch (error) {
          pending = Promise.reject(error)
        }
        pending.then(resolve, reject).finally(() => {
          this.active -= 1
          const next = this.queue.shift()
          if (next) next()
        })
      }
      if (this.active < this.concurrency) run()
      else this.queue.push(run)
    })
  }

  /** 到时拒绝。`onAbort` 拿到的函数会立刻拒绝，给 restart 用。加载超时走全局定时器。 */
  private withTimeout(pending: Promise<T>, key: string, onAbort: (abort: () => void) => void): Promise<T> {
    if (!(this.timeout > 0)) {
      return new Promise((resolve, reject) => {
        onAbort(() => {
          reject(new Error(`load restarted: ${key}`))
        })
        pending.then(resolve, reject)
      })
    }
    return new Promise((resolve, reject) => {
      let settled = false
      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        reject(new Error(`load timeout: ${key}`))
      }, this.timeout)
      const stop = (): void => {
        clearTimeout(timer)
      }
      onAbort(() => {
        if (settled) return
        settled = true
        stop()
        reject(new Error(`load restarted: ${key}`))
      })
      pending.then(
        (value) => {
          if (settled) return
          settled = true
          stop()
          resolve(value)
        },
        (error: unknown) => {
          if (settled) return
          settled = true
          stop()
          reject(error)
        },
      )
    })
  }
}

// MARK: spine handles

export interface SpineLoadContext {
  readonly fresh: true
  readonly keep: ReadonlySet<string>
}

export interface SpineAcquireOptions {
  readonly retry?: boolean
}

export interface SpineCacheOptions {
  readonly load: (file: SpineFile, context?: SpineLoadContext) => unknown | Promise<unknown>
  readonly unload?: (file: SpineFile, value: unknown, keep: ReadonlySet<string>) => void | Promise<void>
  readonly max?: number
  readonly timeout?: number
  readonly concurrency?: number
  readonly failTtl?: number
  readonly now?: () => number
  readonly weigh?: (value: unknown) => number
  readonly idleBytes?: number
  readonly quietBytes?: number
  readonly idleGrace?: number
  readonly evictDelay?: number
  readonly quietDelay?: number
  readonly timers?: RefTimers
}

export interface SpineCache {
  acquire(file: SpineFile, options?: SpineAcquireOptions): Promise<unknown>
  restart(file: SpineFile): boolean
  release(file: SpineFile): void
  peek(file: SpineFile): unknown
  hold(): () => void
  stats(): RefStats
  clear(): void
  readonly cache: RefLru<unknown, SpineFile>
}

function bareSpine(skel: string): SpineFile {
  return { skel, atlas: skel.replace(/\.skel$/, ".atlas"), anims: {} }
}

function clocked(
  settings: RefLruOptions<unknown, SpineFile>,
  now: (() => number) | undefined,
  timers: RefTimers | undefined,
): RefLruOptions<unknown, SpineFile> {
  if (now !== undefined && timers !== undefined) return { ...settings, now, timers }
  if (now !== undefined) return { ...settings, now }
  if (timers !== undefined) return { ...settings, timers }
  return settings
}

/**
 * 已解码骨架句柄的缓存。加载和卸载由调用方注入。
 * 重新加载或失败后的再次加载会带上 `fresh`，`keep` 是其他仍在缓存里的骨架还在用的图集页。
 * 键上若已有一条更新的记录，迟到的卸载不会拆掉它。
 */
export function createSpineCache(options: SpineCacheOptions): SpineCache {
  const files = new Map<string, SpineFile>()
  let cache!: RefLru<unknown, SpineFile>
  const weigh = options.weigh ?? spineDataWeight
  const pagesExcept = (key: string): ReadonlySet<string> => {
    const keep = new Set<string>()
    for (const [otherKey, other] of files) {
      if (otherKey === key || !cache.map.has(otherKey)) continue
      for (const page of spinePages(other)) keep.add(page)
    }
    return keep
  }
  const settings: RefLruOptions<unknown, SpineFile> = {
    load: (key, file, context) => {
      files.set(key, file)
      if (!context) return options.load(file)
      return options.load(file, { fresh: true, keep: pagesExcept(key) })
    },
    unload: (key, value, record) => {
      const current = cache.map.get(key)
      if (current && current !== record) return
      const stored = files.get(key)
      files.delete(key)
      const file = stored ?? bareSpine(key)
      return options.unload?.(file, value, pagesExcept(key))
    },
    weigh: (_key, value) => weigh(value),
    max: options.max ?? 60,
    timeout: options.timeout ?? 20000,
    concurrency: options.concurrency ?? 6,
    failTtl: options.failTtl ?? 60000,
    maxIdleWeight: options.idleBytes ?? spineIdleBytes,
    quietWeight: options.quietBytes ?? 0,
    idleGrace: options.idleGrace ?? spineIdleGraceMs,
    quietDelay: options.quietDelay ?? spineQuietDelayMs,
    evictDelay: options.evictDelay ?? spineEvictDelayMs,
  }
  cache = new RefLru(clocked(settings, options.now, options.timers))
  return {
    acquire: (file, acquireOptions) => {
      if (!validSpine(file)) return Promise.reject(new Error("no spine entry"))
      return cache.acquire(file.skel, file, acquireOptions)
    },
    restart: (file) => (validSpine(file) ? cache.restart(file.skel, file) : false),
    release: (file) => {
      if (file.skel) cache.release(file.skel)
    },
    peek: (file) => (file.skel ? cache.peek(file.skel) : null),
    hold: () => cache.hold(),
    stats: () => cache.stats(),
    clear: () => {
      cache.clear()
    },
    cache,
  }
}
