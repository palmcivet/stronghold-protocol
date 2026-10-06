import { mediaUrl } from "./media-route.js"

/** 解码缓冲最多保留多少条。插入顺序就是淘汰顺序。 */
export const audioBufferCount: number = 180
/** 解码后的 PCM 字节预算。一条语音大约 0.4–1.3 MB，只卡条数不够。 */
export const audioBufferBytes: number = 64 * 1024 * 1024

export interface DecodedAudio {
  readonly length: number
  readonly numberOfChannels: number
}

export interface AudioFetchResponse {
  readonly ok: boolean
  readonly status: number
  readonly headers?: { get(name: string): string | null }
  readonly body?: { cancel?: () => void | Promise<unknown> } | null
  arrayBuffer(): Promise<ArrayBuffer>
}

export interface AudioFetch {
  (url: string): Promise<AudioFetchResponse>
}

export interface AudioBufferOptions {
  readonly fetch: AudioFetch
  readonly decode: (bytes: ArrayBuffer) => Promise<DecodedAudio | null>
  /** 同一个地址只叫一次。缺省写到 console。 */
  readonly warn?: (url: string, error: unknown) => void
  /** 返回 true 的地址在超预算时留下来。 */
  readonly retain?: (url: string) => boolean
  readonly limit?: number
  readonly bytes?: number
}

export interface AudioBufferCache {
  load(url: string): Promise<DecodedAudio | null>
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

function defaultWarn(url: string, error: unknown): void {
  const detail = error instanceof Error ? error.message : error === undefined || error === null ? "" : String(error)
  console.warn(`[audio] ${url} unavailable`, detail)
}

async function cancelBody(response: AudioFetchResponse): Promise<void> {
  try {
    await response.body?.cancel?.()
  } catch {
    // 接下来要请求原始地址，这份正文排不排得空不重要
  }
}

/**
 * 先请求无扩展名的媒体地址，不行再请求原来的 URL，然后解码。
 * 失败得到 null，并且每个地址只警告一次。缓存按插入先后淘汰，重量是解码后的 PCM 字节。
 */
export function createAudioBuffer(options: AudioBufferOptions): AudioBufferCache {
  const request = options.fetch
  const decode = options.decode
  const warn = options.warn ?? defaultWarn
  const retain = options.retain ?? (() => false)
  const limit = options.limit ?? audioBufferCount
  const budget = options.bytes ?? audioBufferBytes
  const buffers = new Map<string, Promise<DecodedAudio | null>>()
  const weights = new Map<string, number>()
  const warned = new Set<string>()

  const warnOnce = (url: string, error: unknown): void => {
    if (warned.has(url)) return
    warned.add(url)
    try {
      warn(url, error)
    } catch {
      // 警告失败不影响这次 null
    }
  }

  const trim = (): void => {
    let bytes = 0
    for (const weight of weights.values()) bytes += weight
    if (buffers.size <= limit && bytes <= budget) return
    for (const url of [...buffers.keys()]) {
      if (buffers.size <= limit && bytes <= budget) break
      if (retain(url)) continue
      bytes -= weights.get(url) ?? 0
      buffers.delete(url)
      weights.delete(url)
    }
  }

  const read = async (url: string): Promise<DecodedAudio | null> => {
    try {
      const routed = mediaUrl(url)
      let response = await request(routed)
      if (routed !== url && !isAudioResponse(response)) {
        await cancelBody(response)
        response = await request(url)
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const bytes = await response.arrayBuffer()
      const decoded = await decode(bytes)
      if (!decoded) throw new Error("decode failed")
      return decoded
    } catch (error) {
      warnOnce(url, error)
      return null
    }
  }

  return {
    load: (url) => {
      if (typeof url !== "string" || url.length === 0) return Promise.resolve(null)
      const hit = buffers.get(url)
      if (hit) {
        buffers.delete(url)
        buffers.set(url, hit)
        return hit
      }
      const promise = read(url)
      buffers.set(url, promise)
      void promise.then(
        (buffer) => {
          if (buffers.get(url) !== promise || buffer === null) return
          weights.set(url, pcmBytes(buffer.length, buffer.numberOfChannels))
          trim()
        },
        () => {},
      )
      trim()
      return promise
    },
  }
}
