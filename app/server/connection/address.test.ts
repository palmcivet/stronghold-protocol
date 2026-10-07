import assert from "node:assert/strict"
import { test } from "vitest"
import { clientAddress, isLocalIp, limitKeyOf, normalizeIp } from "#server/connection/address.js"
import { parseTrustProxy } from "#server/entry/index.js"

const request = (remoteAddress: string | undefined, headers: Record<string, string> = {}) =>
  ({ socket: { remoteAddress }, headers }) as Parameters<typeof clientAddress>[0]

test("normalizeIp canonicalizes mapped, zoned, and port-bearing addresses", () => {
  assert.equal(normalizeIp("::ffff:127.0.0.1"), "127.0.0.1")
  assert.equal(normalizeIp("::ffff:0102:0304"), "1.2.3.4")
  assert.equal(normalizeIp("[FE80::1%en0]"), "fe80::1")
  assert.equal(normalizeIp("not-an-ip"), "")
  assert.equal(normalizeIp("203.0.113.4:5678"), "203.0.113.4")
  assert.equal(normalizeIp("[2001:db8::1]:443"), "2001:db8::1")
})

test("isLocalIp covers loopback, private, CGNAT, and link-local", () => {
  for (const ip of ["127.0.0.1", "::1", "10.0.0.8", "172.16.4.4", "192.168.65.1", "100.100.1.1", "fd12::1", "fe80::2"]) {
    assert.equal(isLocalIp(ip), true, ip)
  }
  for (const ip of ["8.8.8.8", "172.32.0.1", "2001:db8::1"]) assert.equal(isLocalIp(ip), false, ip)
})

test("limitKeyOf groups an IPv6 address by its /64", () => {
  assert.equal(limitKeyOf("2001:db8:1:2:3:4:5:6"), "2001:db8:1:2::/64")
  assert.equal(limitKeyOf("2001:db8:1:2::9"), "2001:db8:1:2::/64")
  assert.equal(limitKeyOf("203.0.113.1"), "203.0.113.1")
})

test("clientAddress trusts forwarding headers only from local peers", () => {
  assert.deepEqual(clientAddress(request("::ffff:127.0.0.1", { "x-forwarded-for": "6.6.6.6, 203.0.113.7" })), { ip: "203.0.113.7", key: "203.0.113.7" })
  assert.deepEqual(clientAddress(request("127.0.0.1", { "cf-connecting-ip": "203.0.113.8", "x-forwarded-for": "6.6.6.6" })), { ip: "203.0.113.8", key: "203.0.113.8" })
  assert.deepEqual(clientAddress(request("127.0.0.1", { "x-real-ip": "2001:db8:a:b::5" })), { ip: "2001:db8:a:b::5", key: "2001:db8:a:b::/64" })
  assert.deepEqual(clientAddress(request("127.0.0.1")), { ip: "127.0.0.1", key: null })
  assert.deepEqual(clientAddress(request("192.168.1.20", { "x-forwarded-for": "192.168.1.21" })), { ip: "192.168.1.21", key: null })
  assert.deepEqual(clientAddress(request("198.51.100.3", { "x-forwarded-for": "203.0.113.7" })), { ip: "198.51.100.3", key: "198.51.100.3" })
  assert.deepEqual(clientAddress(request("198.51.100.3", { "x-forwarded-for": "203.0.113.7" }), true), { ip: "203.0.113.7", key: "203.0.113.7" })
  assert.deepEqual(clientAddress(request("127.0.0.1", { "x-forwarded-for": "203.0.113.7" }), false), { ip: "127.0.0.1", key: null })
  assert.deepEqual(clientAddress(request("127.0.0.1", { "x-forwarded-for": "garbage" })), { ip: "127.0.0.1", key: null })
  assert.deepEqual(clientAddress(undefined), { ip: "?", key: null })
})

test("parseTrustProxy accepts the documented synonyms", () => {
  assert.equal(parseTrustProxy("1"), true)
  assert.equal(parseTrustProxy("always"), true)
  assert.equal(parseTrustProxy("off"), false)
  assert.equal(parseTrustProxy("never"), false)
  assert.equal(parseTrustProxy(undefined), "auto")
  assert.equal(parseTrustProxy("auto"), "auto")
})
