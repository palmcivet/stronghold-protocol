import { expect, test } from "vitest"
import type { AssetKey } from "#key/asset-key.js"
import type { ResolvedAsset } from "#resolver/overlay.js"
import { audioSource, createAudioBuffer, isAudioResponse, pcmBytes, type AudioFetchResponse, type DecodedAudio } from "#cache/audio.js"

const HASH = "ab".repeat(32)

function response(ok = true, type: string | null = "audio/mpeg", status = 200): AudioFetchResponse {
  return {
    ok,
    status,
    headers: { get: (name) => (name === "content-type" ? type : null) },
    arrayBuffer: async () => new ArrayBuffer(8),
  }
}

function setup(respond: (url: string) => AudioFetchResponse = () => response(), length = 1000) {
  const requests: string[] = []
  const warnings: AssetKey[] = []
  const cache = createAudioBuffer({
    fetch: async (url) => {
      requests.push(url)
      return respond(url)
    },
    decode: async (): Promise<DecodedAudio> => ({ length, numberOfChannels: 2 }),
    warn: (key) => {
      warnings.push(key)
    },
    limit: 2,
  })
  return { cache, requests, warnings }
}

const voice = (n: number) => ({ key: `audio:voice/cn/char_002_amiya/CN_00${n}` as AssetKey, url: `https://cdn.example/res/files/audio/voice/cn/char_002_amiya/CN_00${n}.mp3?v=abababababab` })

test("the url is requested as given: no extensionless route", async () => {
  const { cache, requests } = setup()
  expect(await cache.load(voice(1))).toEqual({ length: 1000, numberOfChannels: 2 })
  expect(requests).toEqual([voice(1).url])
})

test("the cache key is the asset key", async () => {
  const { cache, requests } = setup()
  const first = await cache.load(voice(1))
  expect(await cache.load({ key: voice(1).key, url: "https://elsewhere.example/a.mp3" })).toBe(first)
  await cache.load({ key: "audio:sfx/battle/b_char_tokendead", url: voice(1).url })
  expect(requests).toEqual([voice(1).url, voice(1).url])
})

test("count limit evicts the oldest", async () => {
  const { cache, requests } = setup()
  await cache.load(voice(1))
  await cache.load(voice(2))
  await cache.load(voice(3))
  await cache.load(voice(1))
  expect(requests.length).toBe(4)
})

test("failures resolve null and warn once per key", async () => {
  const { cache, warnings } = setup(() => response(false, null, 404))
  expect(await cache.load(voice(1))).toBeNull()
  expect(await cache.load(voice(1))).toBeNull()
  expect(warnings).toEqual([voice(1).key])
})

test("an HTML page is not audio", async () => {
  const { cache, warnings } = setup(() => response(true, "text/html"))
  expect(await cache.load(voice(1))).toBeNull()
  expect(warnings).toEqual([voice(1).key])
  expect(isAudioResponse(response(true, null))).toBe(true)
  expect(isAudioResponse(response(true, " Audio/MPEG"))).toBe(true)
  expect(isAudioResponse(response(false))).toBe(false)
  expect(isAudioResponse(null)).toBe(false)
})

test("an empty url resolves null without a request", async () => {
  const { cache, requests } = setup()
  expect(await cache.load({ key: voice(1).key, url: "" })).toBeNull()
  expect(requests).toEqual([])
})

test("pcm bytes", () => {
  expect(pcmBytes(1000, 2)).toBe(8000)
  expect(pcmBytes(1000, 0)).toBe(4000)
})

test("audio source takes the main file of an audio entry", () => {
  const files = [{ role: "main", name: null, format: "mp3", bytes: 1, hash: HASH, url: voice(1).url }] as const
  const asset: ResolvedAsset = {
    key: voice(1).key,
    kind: "audio",
    asset: { kind: "audio", files, dependsOn: [], fallbackId: null, preloadGroup: null },
    pack: { type: "base", id: "base", version: "1", contentHash: HASH },
    files,
  }
  expect(audioSource(asset)).toEqual(voice(1))
  expect(audioSource({ ...asset, kind: "image" })).toBeNull()
  expect(audioSource({ ...asset, files: [] })).toBeNull()
})
