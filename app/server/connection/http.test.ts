import assert from "node:assert/strict"
import { test } from "vitest"
import { requestTarget } from "#server/connection/http.js"

test("requestTarget keeps the path of an origin-form URL and of an absolute-form URL", () => {
  assert.deepEqual(requestTarget("/healthz"), { path: "/healthz", query: "" })
  assert.deepEqual(requestTarget("/ws?x=1"), { path: "/ws", query: "x=1" })
  assert.deepEqual(requestTarget("/healthz#section"), { path: "/healthz", query: "" })
  assert.deepEqual(requestTarget("http://127.0.0.1:3000/healthz?v=1"), { path: "/healthz", query: "v=1" })
  assert.deepEqual(requestTarget("http://example.test/ws"), { path: "/ws", query: "" })
  assert.equal(requestTarget("http://"), null)
})
