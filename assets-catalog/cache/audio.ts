import type { AssetKey } from "#key/asset-key.js"
import type { ResolvedAsset } from "#resolver/overlay.js"

/** 解码缓冲最多保留多少条。插入顺序就是淘汰顺序。 */
export const AUDIO_BUFFER_COUNT: number = 180
/** 解码后的 PCM 字节预算。一条语音大约 0.4–1.3 MB，只卡条数不够。 */
export const AUDIO_BUFFER_BYTES: number = 64 * 1024 * 1024

export interface DecodedAudio {
  readonly length: number
  readonly numberOfChannels: number
}

export interface AudioFetchResponse {
  readonly ok: boolean
  readonly status: number
  readonly headers?: { get(name: string): string | null }
  arrayBuffer(): Promise<ArrayBuffer>
}

export interface AudioFetch {
  (url: string): Promise<AudioFetchResponse>
}

/** 一条音频资源：缓存键和文件地址。 */
export interface AudioSource {
  readonly key: AssetKey
  readonly url: string
}

export interface AudioBufferOptions {
  readonly fetch: AudioFetch
  readonly decode: (bytes: ArrayBuffer) => Promise<DecodedAudio | null>
  /** 同一个键只叫一次。缺省写到 console。 */
  readonly warn?: (key: AssetKey, error: unknown) => void
  /** 返回 true 的键在超预算时留下来。 */
  readonly retain?: (key: AssetKey) => boolean
  readonly limit?: number
  readonly bytes?: number
}

export interface AudioBufferCache {
  load(source: AudioSource): Promise<DecodedAudio | null>
}

/** 已解析的 `audio` 条目的主文件。其他种类返回 null。 */
export function audioSource(asset: ResolvedAsset): AudioSource | null {
  if (asset.kind !== "audio") return null
  const main = asset.files.find((file) => file.role === "main")
  return main ? { key: asset.key, url: main.url } : null
}

/**
 * 这份响应能不能当音频解码。没声明类型不算错：缺头不是 HTML 页面的证据。
 * 声明了类型但不是 audio/*，或者响应本身失败，就不是音频。
 */
export function isAudioResponse(response: AudioFetchResponse | null | undefined): boolean {
  if (!response?.ok) return false
  const type = response.headers?.get("content-type")
  return !type || /^\s*audio\//i.test(type)
}

/** `length * channels * 4`。声道数是 0 时按单声道计。 */
export function pcmBytes(length: number, channels: number): number {
  return (length || 0) * (channels || 1) * 4
}

function defaultWarn(key: AssetKey, error: unknown): void {
  const detail = error instanceof Error ? error.message : error === undefined || error === null ? "" : String(error)
  console.warn(`[audio] ${key} unavailable`, detail)
}

/**
 * 按资源键请求并解码音频。失败得到 null，并且每个键只警告一次。
 * 缓存按插入先后淘汰，重量是解码后的 PCM 字节。
 */
export function createAudioBuffer(options: AudioBufferOptions): AudioBufferCache {
  const request = options.fetch
  const decode = options.decode
  const warn = options.warn ?? defaultWarn
  const retain = options.retain ?? (() => false)
  const limit = options.limit ?? AUDIO_BUFFER_COUNT
  const budget = options.bytes ?? AUDIO_BUFFER_BYTES
  const buffers = new Map<AssetKey, Promise<DecodedAudio | null>>()
  const weights = new Map<AssetKey, number>()
  const warned = new Set<AssetKey>()

  const warnOnce = (key: AssetKey, error: unknown): void => {
    if (warned.has(key)) return
    warned.add(key)
    try {
      warn(key, error)
    } catch {
      // 警告失败不影响这次 null
    }
  }

  const trim = (): void => {
    let bytes = 0
    for (const weight of weights.values()) bytes += weight
    if (buffers.size <= limit && bytes <= budget) return
    for (const key of [...buffers.keys()]) {
      if (buffers.size <= limit && bytes <= budget) break
      if (retain(key)) continue
      bytes -= weights.get(key) ?? 0
      buffers.delete(key)
      weights.delete(key)
    }
  }

  const read = async (source: AudioSource): Promise<DecodedAudio | null> => {
    try {
      const response = await request(source.url)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      if (!isAudioResponse(response)) throw new Error(`not audio: ${response.headers?.get("content-type") ?? ""}`)
      const decoded = await decode(await response.arrayBuffer())
      if (!decoded) throw new Error("decode failed")
      return decoded
    } catch (error) {
      warnOnce(source.key, error)
      return null
    }
  }

  return {
    load: (source) => {
      if (!source || typeof source.url !== "string" || source.url.length === 0) return Promise.resolve(null)
      const key = source.key
      const hit = buffers.get(key)
      if (hit) {
        buffers.delete(key)
        buffers.set(key, hit)
        return hit
      }
      const promise = read(source)
      buffers.set(key, promise)
      void promise.then(
        (buffer) => {
          if (buffers.get(key) !== promise || buffer === null) return
          weights.set(key, pcmBytes(buffer.length, buffer.numberOfChannels))
          trim()
        },
        () => {},
      )
      trim()
      return promise
    },
  }
}
