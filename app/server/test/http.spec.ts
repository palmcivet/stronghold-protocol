import http from "node:http"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { APP_VERSION, PROTOCOL_VERSION } from "@alliance/contract/match.js"
import { startServer } from "#server/entry/index.js"
import { TestClient } from "#server/test/client.js"
import { StubMatch } from "#server/test/stub.js"

function httpReq(port: number, rawPath: string, method = "GET"): Promise<{ status: number | undefined; headers: http.IncomingHttpHeaders; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: rawPath, method, agent: false }, (res) => {
      const chunks: Buffer[] = []
      res.on("data", (chunk) => chunks.push(chunk))
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }))
      res.on("error", reject)
    })
    req.on("error", reject)
    req.end()
  })
}

describe("http health and upgrade", () => {
  let port = 0
  let close: (() => Promise<void>) | undefined

  beforeAll(async () => {
    const server = await startServer({ port: 0, host: "127.0.0.1", quiet: true, MatchClass: StubMatch })
    port = server.port
    close = server.close
  })

  afterAll(async () => {
    await close?.()
  })

  test("healthz reports the release version and a null build when none was supplied", async () => {
    const response = await httpReq(port, "/healthz")
    expect(response.status).toBe(200)
    expect(response.headers["cache-control"]).toBe("no-store")
    expect(response.headers["x-content-type-options"]).toBe("nosniff")
    const body = JSON.parse(response.body.toString()) as Record<string, unknown>
    expect(body.ok).toBe(true)
    expect(body.version).toBe(PROTOCOL_VERSION)
    expect(body.app).toBe(APP_VERSION)
    expect(body.build).toBeNull()
    expect(typeof body.rooms).toBe("number")
    expect(typeof body.sockets).toBe("number")
    expect(typeof body.sessions).toBe("number")
  })

  test("a supplied build id is the healthz build", async () => {
    const server = await startServer({ port: 0, host: "127.0.0.1", quiet: true, build: "abc123def456", MatchClass: StubMatch })
    try {
      const response = await httpReq(server.port, "/healthz")
      const body = JSON.parse(response.body.toString()) as { build: string }
      expect(body.build).toBe("abc123def456")
    } finally {
      await server.close()
    }
  })

  test("an absolute-form target still reaches /healthz", async () => {
    const response = await httpReq(port, `http://127.0.0.1:${port}/healthz`)
    expect(response.status).toBe(200)
  })

  test("HEAD /healthz has no body", async () => {
    const response = await httpReq(port, "/healthz", "HEAD")
    expect(response.status).toBe(200)
    expect(response.body.length).toBe(0)
    expect(Number(response.headers["content-length"])).toBeGreaterThan(0)
  })

  test("POST is 405", async () => {
    const response = await httpReq(port, "/healthz", "POST")
    expect(response.status).toBe(405)
    expect(response.headers.allow).toBe("GET, HEAD")
  })

  test("a target longer than 4096 bytes is 414", async () => {
    const response = await httpReq(port, `/${"a".repeat(5000)}`)
    expect(response.status).toBe(414)
  })

  test("upgrade is only accepted on /ws", async () => {
    await expect(TestClient.connect(`ws://127.0.0.1:${port}/other`)).rejects.toThrow(/404/)
    const client = await TestClient.connect(`ws://127.0.0.1:${port}/ws?x=1`)
    await client.close()
  })

  test("the global connection cap refuses the upgrade with 503", async () => {
    const server = await startServer({ port: 0, host: "127.0.0.1", quiet: true, maxConnections: 0, MatchClass: StubMatch })
    try {
      await expect(TestClient.connect(`ws://127.0.0.1:${server.port}/ws`)).rejects.toThrow(/503/)
    } finally {
      await server.close()
    }
  })
})
