import assert from "node:assert/strict"
import { test } from "vitest"
import { sanitizeName, SessionRegistry, TokenBucket } from "#server/connection/session.js"

test("sanitizeName strips control characters and caps the length", () => {
  assert.equal(sanitizeName("  Amiya  "), "Amiya")
  assert.equal(sanitizeName("a\tb\nc"), "a b c")
  assert.equal(sanitizeName(`x${String.fromCharCode(0x202e)}y${String.fromCharCode(0x200b)}z`), "xyz")
  assert.equal(sanitizeName(String.fromCharCode(0xd800)), null)
  assert.equal(sanitizeName(""), null)
  assert.equal(sanitizeName(42), null)
  assert.equal([...(sanitizeName("😀".repeat(20)) ?? "")].length, 12)
})

test("TokenBucket refills continuously up to its burst", () => {
  const bucket = new TokenBucket(40, 40, 0)
  let ok = 0
  for (let i = 0; i < 100; i++) if (bucket.take(0)) ok++
  assert.equal(ok, 40)
  assert.equal(bucket.take(10), false)
  assert.equal(bucket.take(30), true)
  assert.equal(bucket.take(100000), true)
  let burst = 0
  for (let i = 0; i < 100; i++) if (bucket.take(100000)) burst++
  assert.equal(burst, 39)
})

test("SessionRegistry looks up tokens, sweeps expired sessions, and evicts an idle one", () => {
  let now = 1000
  const registry = new SessionRegistry({ reconnectWindowMs: 100, maxSessions: 2, now: () => now })
  const first = registry.create("A")
  const second = registry.create("B")
  assert.ok(first && second)
  assert.equal(registry.byToken(first.token), first)
  assert.equal(registry.byToken("nope"), null)
  assert.equal(registry.byToken(undefined), null)
  first.connected = true
  first.disconnectedAt = null
  second.connected = false
  second.disconnectedAt = now
  second.roomCode = "ABCD"
  assert.equal(registry.create("C"), null)
  second.roomCode = null
  const third = registry.create("C")
  assert.ok(third)
  assert.equal(registry.byId(second.playerId), null)
  third.connected = false
  third.disconnectedAt = now
  now += 101
  assert.equal(registry.byToken(third.token), null)
  assert.deepEqual(registry.sweep(), [third])
  assert.equal(registry.size, 1)
})

test("SessionRegistry lets a session extend its reconnect window, not shorten it", () => {
  let now = 1000
  const registry = new SessionRegistry({ reconnectWindowMs: 100, now: () => now })
  const solo = registry.create("Solo")
  const coop = registry.create("Coop")
  const short = registry.create("Short")
  assert.ok(solo && coop && short)
  solo.resumeWindowMs = 5000
  short.resumeWindowMs = 10
  for (const session of [solo, coop, short]) {
    session.connected = false
    session.disconnectedAt = now
  }
  assert.equal(registry.windowOf(solo), 5000)
  assert.equal(registry.windowOf(coop), 100)
  assert.equal(registry.windowOf(short), 100)
  now += 101
  assert.equal(registry.byToken(solo.token), solo)
  assert.equal(registry.byToken(short.token), null)
  assert.deepEqual(registry.sweep().map((session) => session.name).sort(), ["Coop", "Short"])
  now += 5000
  assert.deepEqual(registry.sweep(), [solo])
  assert.equal(registry.size, 0)
})
