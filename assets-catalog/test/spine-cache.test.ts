import { createSpineCache, spineDataWeight, spineIdleBytes, spinePages, type SpineFile } from "arknights-assets-catalog"
import { expect, test } from "vitest"
import {
  RefLru,
  spineEvictDelayMs,
  spineIdleGraceMs,
  spineQuietDelayMs,
  spineWeightMin,
  type RefTimers,
} from "#runtime/media/spine-cache.js"

interface ClockHandle {
  fn: () => void
  at: number
}

interface Clock {
  readonly now: () => number
  readonly timers: RefTimers
  readonly pending: ClockHandle[]
  advance: (ms: number) => void
}

function clock(): Clock {
  const pending: ClockHandle[] = []
  const state = { t: 0 }
  return {
    now: () => state.t,
    pending,
    timers: {
      set: (fn, ms) => {
        const handle = { fn, at: state.t + ms }
        pending.push(handle)
        return handle
      },
      clear: (handle) => {
        const index = pending.indexOf(handle as ClockHandle)
        if (index >= 0) pending.splice(index, 1)
      },
    },
    advance: (ms) => {
      state.t += ms
      for (const handle of pending.filter((item) => item.at <= state.t)) {
        const index = pending.indexOf(handle)
        if (index >= 0) pending.splice(index, 1)
        handle.fn()
      }
    },
  }
}

const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

function spineFile(id: string, extra: Partial<SpineFile> = {}): SpineFile {
  return {
    skel: `/assets/spine/${id}.skel`,
    atlas: `/assets/spine/${id}.atlas`,
    textures: [`/assets/spine/${id}.png`],
    pma: false,
    anims: { idle: "Idle" },
    ...extra,
  }
}

test("RefLru dedupes concurrent loads, refcounts, and evicts idle entries above max", async () => {
  const loads: string[] = []
  const unloads: (readonly [string, string])[] = []
  const lru = new RefLru<string, void>({
    max: 2,
    load: async (key) => {
      loads.push(key)
      return `v:${key}`
    },
    unload: (key, value) => {
      unloads.push([key, value ?? ""])
    },
  })
  const [first, second] = await Promise.all([lru.acquire("a"), lru.acquire("a")])
  expect(first).toBe("v:a")
  expect(second).toBe("v:a")
  expect(loads).toEqual(["a"])
  await lru.acquire("b")
  await lru.acquire("c")
  expect(lru.size).toBe(3)
  lru.release("a")
  lru.release("a")
  expect(unloads).toEqual([["a", "v:a"]])
  expect(lru.peek("a")).toBeNull()
  lru.release("b")
  lru.release("c")
  expect(lru.size).toBe(2)
  await lru.acquire("d")
  expect(lru.size).toBe(2)
  expect(unloads.map((row) => row[0])).toEqual(["a", "b"])
  lru.release("zzz")
  lru.release("d")
  lru.release("d")
  expect(lru.stats().refs).toBe(0)
  lru.clear()
  expect(lru.size).toBe(0)
})

test("failures reject, are remembered for failTtl, then retried", async () => {
  let now = 0
  let calls = 0
  const lru = new RefLru<string, void>({
    failTtl: 1000,
    now: () => now,
    load: async () => {
      calls += 1
      throw new Error("404")
    },
  })
  await expect(lru.acquire("x")).rejects.toThrow(/404/)
  await expect(lru.acquire("x")).rejects.toThrow(/404/)
  expect(calls).toBe(1)
  now = 5000
  await expect(lru.acquire("x")).rejects.toThrow(/404/)
  expect(calls).toBe(2)
  expect(lru.stats().failed).toBe(1)
})

test("timeout rejects slow loads", async () => {
  const lru = new RefLru<string, void>({ timeout: 20, load: () => new Promise(() => {}) })
  await expect(lru.acquire("slow")).rejects.toThrow(/timeout/)
})

test("concurrency cap queues loads", async () => {
  let active = 0
  let peak = 0
  const lru = new RefLru<string, void>({
    concurrency: 2,
    max: 100,
    load: async (key) => {
      active += 1
      peak = Math.max(peak, active)
      await tick()
      await tick()
      active -= 1
      return key
    },
  })
  const all = await Promise.all(["a", "b", "c", "d", "e"].map((key) => lru.acquire(key)))
  expect(all).toEqual(["a", "b", "c", "d", "e"])
  expect(peak).toBe(2)
})

test("an entry evicted while loading unloads the late value", async () => {
  let resolve: ((value: string) => void) | undefined
  const unloads: string[] = []
  const lru = new RefLru<string, void>({
    max: 1,
    load: () =>
      new Promise((done) => {
        resolve = done
      }),
    unload: (key) => {
      unloads.push(key)
    },
  })
  const pending = lru.acquire("a")
  lru.clear()
  resolve?.("late")
  expect(await pending).toBe("late")
  expect(unloads).toEqual(["a"])
})

test("RefLru requires a loader", () => {
  expect(() => new RefLru({} as never)).toThrow(TypeError)
})

const weight = { a: 30, b: 30, c: 30, d: 5 }

test("idle weight above the budget goes least-recently-used once past the grace", async () => {
  const c = clock()
  const unloads: string[] = []
  const lru = new RefLru<string, void>({
    max: 100,
    load: async (key) => key,
    unload: (key) => {
      unloads.push(key)
    },
    weigh: (key) => weight[key as keyof typeof weight],
    maxIdleWeight: 50,
    idleGrace: 1000,
    now: c.now,
    timers: c.timers,
  })
  for (const key of ["a", "b", "c", "d"] as const) await lru.acquire(key)
  lru.release("a")
  lru.release("b")
  expect(unloads).toEqual([])
  expect(lru.stats().idleWeight).toBe(60)
  expect(c.pending).toHaveLength(1)
  await lru.acquire("b")
  c.advance(1000)
  expect(unloads).toEqual([])
  lru.release("b")
  expect(unloads).toEqual(["a"])
  lru.release("c")
  c.advance(400)
  expect(unloads).toEqual(["a"])
  c.advance(700)
  expect(unloads).toEqual(["a", "b"])
  expect(lru.peek("c")).toBeTruthy()
  expect(lru.peek("d")).toBeTruthy()
  expect(lru.stats().weight).toBe(35)
  lru.clear()
  expect(c.pending).toHaveLength(0)
})

test("nothing referenced uses the quiet budget after the grace; an unweighted cache stays", async () => {
  const c = clock()
  const unloads: string[] = []
  const lru = new RefLru<string, void>({
    max: 100,
    load: async (key) => key,
    unload: (key) => {
      unloads.push(key)
    },
    weigh: (key) => weight[key as keyof typeof weight],
    maxIdleWeight: 1000,
    quietWeight: 0,
    idleGrace: 1000,
    now: c.now,
    timers: c.timers,
  })
  for (const key of ["a", "d"] as const) await lru.acquire(key)
  lru.release("a")
  c.advance(5000)
  expect(unloads).toEqual([])
  lru.release("d")
  expect(unloads).toEqual(["a"])
  c.advance(1100)
  expect(unloads).toEqual(["a", "d"])
  expect(lru.size).toBe(0)
  const plain = new RefLru<string, void>({
    max: 100,
    load: async (key) => key,
    unload: (key) => {
      unloads.push(key)
    },
    maxIdleWeight: 0,
    quietWeight: 0,
    now: c.now,
    timers: c.timers,
  })
  await plain.acquire("x")
  plain.release("x")
  expect(plain.size).toBe(1)
  expect(c.pending).toHaveLength(0)
})

test("a released-while-loading entry past its grace is dropped when it becomes ready", async () => {
  const c = clock()
  const unloads: string[] = []
  let resolve: ((value: string) => void) | undefined
  const lru = new RefLru<string, void>({
    load: () =>
      new Promise((done) => {
        resolve = done
      }),
    unload: (key) => {
      unloads.push(key)
    },
    weigh: () => 10,
    maxIdleWeight: 0,
    idleGrace: 100,
    now: c.now,
    timers: c.timers,
  })
  const pending = lru.acquire("a")
  lru.release("a")
  c.advance(200)
  resolve?.("v")
  await pending
  expect(unloads).toEqual(["a"])
})

test("a load whose unload is still in flight waits and receives a fresh value", async () => {
  const order: string[] = []
  let finishUnload: (() => void) | undefined
  let n = 0
  const lru = new RefLru<string, void>({
    max: 1,
    load: async (key) => {
      order.push(`load ${key}`)
      n += 1
      return `${key}#${n}`
    },
    unload: (_key, value) => {
      order.push(`unload ${value}`)
      return new Promise((resolve) => {
        finishUnload = () => {
          order.push(`unloaded ${value}`)
          resolve()
        }
      })
    },
  })
  expect(await lru.acquire("a")).toBe("a#1")
  await lru.acquire("b")
  lru.release("a")
  expect(lru.unloading("a")).toBe(true)
  expect(lru.stats().unloading).toBe(1)
  const again = lru.acquire("a")
  await tick()
  expect(order).toEqual(["load a", "load b", "unload a#1"])
  finishUnload?.()
  expect(await again).toBe("a#3")
  expect(order.slice(3)).toEqual(["unloaded a#1", "load a"])
  await tick()
  expect(lru.unloading("a")).toBe(false)
  const second = new RefLru<string, void>({
    max: 1,
    load: async (key) => key,
    unload: () => {
      throw new Error("x")
    },
  })
  await second.acquire("a")
  await second.acquire("b")
  second.release("a")
  expect(await second.acquire("a")).toBe("a")
})

test("evictDelay keeps what a rebuilt scene takes back", async () => {
  const c = clock()
  const unloads: string[] = []
  let loads = 0
  const lru = new RefLru<string, void>({
    max: 2,
    load: async (key) => {
      loads += 1
      return key
    },
    unload: (key) => {
      unloads.push(key)
    },
    evictDelay: 500,
    now: c.now,
    timers: c.timers,
  })
  for (const key of ["a", "b", "c"]) await lru.acquire(key)
  for (const key of ["a", "b", "c"]) lru.release(key)
  for (const key of ["a", "b"]) await lru.acquire(key)
  expect(unloads).toEqual([])
  expect(c.pending).toHaveLength(1)
  c.advance(510)
  expect(unloads).toEqual(["c"])
  expect(loads).toBe(3)
})

test("quietDelay treats a lasting empty scene differently from a switch", async () => {
  const c = clock()
  const unloads: string[] = []
  const lru = new RefLru<string, void>({
    max: 100,
    load: async (key) => key,
    unload: (key) => {
      unloads.push(key)
    },
    weigh: () => 10,
    maxIdleWeight: 100,
    quietWeight: 0,
    idleGrace: 5000,
    quietDelay: 3000,
    now: c.now,
    timers: c.timers,
  })
  await lru.acquire("bench")
  await lru.acquire("op")
  lru.release("bench")
  c.advance(20000)
  lru.release("op")
  expect(unloads).toEqual([])
  await lru.acquire("bench")
  await lru.acquire("op")
  c.advance(5000)
  expect(unloads).toEqual([])
  lru.release("bench")
  lru.release("op")
  c.advance(1000)
  expect(unloads).toEqual([])
  c.advance(2100)
  expect(unloads).toEqual([])
  c.advance(2000)
  expect(unloads.sort()).toEqual(["bench", "op"])
})

test("spine pages come from textures, otherwise the skeleton png", () => {
  expect(spinePages(spineFile("x"))).toEqual(["/assets/spine/x.png"])
  expect(spinePages({ skel: "/s/a.skel", atlas: "/s/a.atlas", anims: {}, textures: ["/s/a.png", "/s/a2.png"] })).toEqual(["/s/a.png", "/s/a2.png"])
  expect(spinePages({ skel: "/s/b.skel", atlas: "/s/b.atlas", anims: {} })).toEqual(["/s/b.png"])
})

test("spineDataWeight counts timelines and mesh arrays and never throws", () => {
  const floats = (count: number): Float32Array => new Float32Array(count)
  const data = {
    bones: [{}, {}],
    slots: [{}],
    skins: [{ attachments: [{ body: { vertices: floats(100), regionUVs: floats(50), triangles: [1, 2, 3] }, head: { offset: floats(8) } }, null] }],
    animations: [
      {
        timelines: [
          { frames: floats(10000), curves: floats(19 * 3333) },
          { frames: floats(10), frameVertices: [floats(2000), floats(2000)] },
          { frames: floats(4), drawOrders: [[0, 1], null] },
        ],
      },
    ],
  }
  const measured = spineDataWeight(data)
  const arrays = 4 * (100 + 50 + 8 + 10000 + 19 * 3333 + 10 + 2000 + 2000 + 4) + 8 * (3 + 2)
  expect(measured).toBeGreaterThan(arrays)
  expect(measured).toBeLessThan(arrays * 2)
  const bigger = { ...data, animations: [...data.animations, { timelines: [{ frames: floats(100000) }] }] }
  expect(spineDataWeight(bigger) - measured).toBeGreaterThanOrEqual(400000)
  for (const junk of [null, undefined, 3, "x", {}, { animations: 5, skins: [{ attachments: "x" }] }, { animations: [null, { timelines: [7] }] }]) {
    expect(spineDataWeight(junk)).toBe(spineWeightMin)
  }
})

test("the spine cache budgets idle skeletons by weight", async () => {
  const defaults = createSpineCache({ load: async () => ({ animations: [] }), unload: () => {} })
  expect(defaults.cache.maxIdleWeight).toBe(spineIdleBytes)
  expect(defaults.cache.quietWeight).toBe(0)
  expect(defaults.cache.idleGrace).toBe(spineIdleGraceMs)
  expect(spineIdleBytes).toBeLessThanOrEqual(64 * 1024 * 1024)
  expect(spineIdleGraceMs).toBeGreaterThanOrEqual(5000)
  const c = clock()
  const unloads: string[] = []
  const big = { animations: [{ timelines: [{ frames: new Float32Array(5 * 1024 * 1024) }] }] }
  const cache = createSpineCache({
    load: async () => big,
    unload: (file) => {
      unloads.push(file.skel)
    },
    now: c.now,
    timers: c.timers,
  })
  const first = spineFile("amiya")
  const second = spineFile("chen")
  const third = spineFile("slime")
  const keep = spineFile("token")
  for (const file of [first, second, third, keep]) await cache.acquire(file)
  for (const file of [first, second, third]) cache.release(file)
  c.advance(spineIdleGraceMs + 10)
  expect(unloads).toEqual([first.skel])
  expect(cache.stats().idleWeight).toBeLessThanOrEqual(spineIdleBytes)
  cache.release(keep)
  c.advance(spineIdleGraceMs + 10)
  expect(cache.stats().size).toBe(0)
})

test("acquire and release use the injected loader", async () => {
  const cache = createSpineCache({
    load: async (file) => ({ animations: [], from: file.skel }),
    unload: () => {},
    max: 1,
  })
  const file = spineFile("amiya")
  const loaded = (await cache.acquire(file)) as { from: string }
  expect(loaded.from).toBe(file.skel)
  expect(cache.peek(file)).toBe(loaded)
  cache.release(file)
  await expect(cache.acquire(null as unknown as SpineFile)).rejects.toThrow(/no spine entry/)
  expect(cache.stats().refs).toBe(0)
})

test("battle to prep keeps models alive, and an eager cache reloads a dropped one", async () => {
  for (const eager of [false, true]) {
    const c = clock()
    const cache = createSpineCache({
      load: async (file) => ({ skel: file.skel, destroyed: false }),
      unload: (_file, value) => {
        ;(value as { destroyed: boolean }).destroyed = true
      },
      now: c.now,
      timers: c.timers,
      ...(eager ? { evictDelay: 0, quietDelay: 0 } : {}),
    })
    const bench = spineFile("chen")
    const op = spineFile("amiya")
    const foe = spineFile("slime")
    const bench0 = (await cache.acquire(bench)) as { destroyed: boolean }
    await cache.acquire(op)
    cache.release(bench)
    cache.release(op)
    await cache.acquire(op)
    await cache.acquire(foe)
    c.advance(spineIdleGraceMs + 20000)
    cache.release(op)
    cache.release(foe)
    const [returnedBench, returnedOp] = (await Promise.all([cache.acquire(bench), cache.acquire(op)])) as { destroyed: boolean }[]
    await tick()
    await tick()
    c.advance(spineEvictDelayMs + spineQuietDelayMs + 10)
    await tick()
    await tick()
    expect(returnedBench?.destroyed, eager ? "eager bench" : "default bench").toBe(false)
    expect(returnedOp?.destroyed, eager ? "eager board" : "default board").toBe(false)
    if (eager) expect(returnedBench).not.toBe(bench0)
    else expect(returnedBench).toBe(bench0)
    expect(cache.stats().unloading).toBe(0)
  }
})

test("eviction passes keep for pages another cached skeleton still uses", async () => {
  const c = clock()
  const unloads: { skel: string; keep: readonly string[] }[] = []
  const cache = createSpineCache({
    load: async (file) => ({ from: file.skel }),
    unload: (file, _value, keep) => {
      unloads.push({ skel: file.skel, keep: [...keep].sort() })
    },
    max: 1,
    now: c.now,
    timers: c.timers,
  })
  const first = spineFile("a", { textures: ["/assets/spine/a.png", "/assets/spine/common.png"] })
  const second = spineFile("b", { textures: ["/assets/spine/b.png", "/assets/spine/common.png"] })
  await cache.acquire(first)
  await cache.acquire(second)
  cache.release(first)
  expect(unloads).toEqual([])
  c.advance(spineEvictDelayMs + 10)
  expect(unloads).toEqual([
    { skel: first.skel, keep: ["/assets/spine/b.png", "/assets/spine/common.png"] },
  ])
  expect(unloads[0]?.keep).not.toContain("/assets/spine/a.png")
  cache.release(second)
  cache.clear()
  expect(unloads[1]?.keep).toEqual([])
})

test("a late value of a dropped load does not unload a newer load of the same skeleton", async () => {
  const pending: Array<() => void> = []
  const unloads: string[] = []
  const cache = createSpineCache({
    load: (file) =>
      new Promise((resolve) => {
        pending.push(() => resolve({ from: file.skel }))
      }),
    unload: (file) => {
      unloads.push(file.skel)
    },
    max: 5,
  })
  const file = spineFile("late")
  const first = cache.acquire(file)
  cache.clear()
  const second = cache.acquire(file)
  pending.shift()?.()
  await first
  expect(unloads).toEqual([])
  pending.shift()?.()
  expect(await second).toEqual({ from: file.skel })
})
