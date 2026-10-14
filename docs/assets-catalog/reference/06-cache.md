---
title: 缓存
description: 以资源键为缓存键的 Spine 句柄缓存与音频解码缓存：怎样提供加载函数、引用怎样计数、空闲时何时卸载。
---

# 缓存

两个缓存都以资源键为缓存键：同一个键只加载一次，同一份字节在两个键下是两条缓存。缓存不发请求，加载与解码由调用方提供；文件地址来自 [解析器](./05-resolver.md)。

- `createSpineCache`：Spine 模型，按引用计数管理，空闲后再卸载
- `createAudioBuffer`：解码后的音频，按条数与字节上限淘汰

## Spine

### 最小示例

```ts
import {
  createAssetResolver,
  createSpineCache,
  isPackManifest,
  spineSource,
} from "arknights-assets-catalog"

const url = "https://cdn.example/packs/base/manifest.json"
const manifest: unknown = await (await fetch(url)).json()
if (!isPackManifest(manifest)) {
  throw new Error(`not a pack manifest: ${url}`)
}
const resolver = createAssetResolver([{ manifest, url }])

interface SpineFiles {
  readonly skel: ArrayBuffer
  readonly atlas: string
  readonly pages: ReadonlyMap<string, Blob>
}

const textures = new Map<string, Blob>()

const spines = createSpineCache({
  load: async (source): Promise<SpineFiles> => {
    const pages = new Map<string, Blob>()
    for (const page of source.pages) {
      const blob = textures.get(page) ?? (await (await fetch(page)).blob())
      textures.set(page, blob)
      pages.set(page, blob)
    }
    return {
      skel: await (await fetch(source.skel)).arrayBuffer(),
      atlas: await (await fetch(source.atlas)).text(),
      pages,
    }
  },
  unload: (source, _files, keep) => {
    for (const page of source.pages) {
      if (!keep.has(page)) {
        textures.delete(page)
      }
    }
  },
})

const slime = resolver.resolve("spine:enemy/slime")
const source = slime ? spineSource(slime) : null
if (source) {
  const files = (await spines.acquire(source)) as SpineFiles
  console.log(files.pages.size) // 1
  spines.release(source.key)
}
```

这里的 `load` 只取回文件内容。接入 Spine 运行时时，在 `load` 里把骨架和图集交给运行时解析，返回解析好的对象；在 `unload` 里释放它。

### 引用与卸载

- `spineSource(resolved)` 从条目里取出 `skel`、`atlas`、全部 `page` 与可选 `meta` 的地址；不是 `spine` 条目或缺文件时返回 `null`
- `acquire(source)` 取得一次引用；同一个键的并发请求共用一次加载
- `release(key)` 放掉一次引用。有引用的模型不会被卸载
- `peek(key)` 返回已就绪的值，不改变引用
- `restart(source)` 在加载中时重开一次尝试，等待的调用方不受影响
- `hold()` 表示场景马上还会用这些模型，返回的函数解除；`clear()` 全部卸载
- 卸载回调的 `keep` 是其他仍在缓存里的模型还在用的图集页地址，据此保留共享贴图
- 同一个键的卸载还没结束时，下一次加载会等它结束

### 空闲之后

引用全部放掉的模型叫**空闲模型**。它不会马上卸载：

- 每次释放后，等 `evictDelay`（默认 1 秒）再集中整理一次
- 缓存里的条数超过 `max`（默认 60）时，最久没用的空闲模型先卸载
- 空闲模型的估算字节超过 `idleBytes`（默认 `SPINE_IDLE_BYTES`，48 MB）时，最久没用的先卸载
- 刚释放的模型有 `idleGrace`（默认 15 秒）的宽限，宽限内不按字节卸载
- 整个缓存没有任何引用、也没有 `hold`，持续 `quietDelay`（默认 3 秒）后，字节上限换成 `quietBytes`（默认 0）：过了宽限期的空闲模型全部卸载

### 常用选项

- `load(source, context)`：必填。返回加载好的值。重新加载时 `context` 为 `{ fresh: true, keep }`
- `unload(source, value, keep)`：卸载回调，可以返回 promise
- `max`、`idleBytes`、`quietBytes`、`idleGrace`、`evictDelay`、`quietDelay`：见上一节
- `weigh(value)`：估算一个值的字节数。默认 `spineDataWeight`，按 Spine 骨架数据的形状估算
- `timeout`：单次加载超时，默认 20 秒
- `concurrency`：同时进行的加载数，默认 6
- `failTtl`：失败结果保留多久，默认 60 秒。期间再次 `acquire` 得到同一个失败；`acquire(source, { retry: true })` 在没人引用时立即重试
- `now`：时钟，测试时可以替换

## 音频

```ts
import {
  audioSource,
  createAssetResolver,
  createAudioBuffer,
  isPackManifest,
} from "arknights-assets-catalog"

const url = "https://cdn.example/packs/base/manifest.json"
const manifest: unknown = await (await fetch(url)).json()
if (!isPackManifest(manifest)) {
  throw new Error(`not a pack manifest: ${url}`)
}
const resolver = createAssetResolver([{ manifest, url }])

const context = new AudioContext()
const audio = createAudioBuffer({
  fetch: (address) => fetch(address),
  decode: (bytes) => context.decodeAudioData(bytes),
})

const battle = resolver.resolve("audio:bgm/battle")
const source = battle ? audioSource(battle) : null
const buffer = source ? await audio.load(source) : null
console.log(buffer !== null) // true
```

- `audioSource(resolved)` 取 `audio` 条目的主文件；其他种类返回 `null`
- `load(source)` 按 `source.url` 请求并解码，结果按 `source.key` 缓存
- 失败时返回 `null`，每个键只警告一次；`warn` 选项替换默认的 `console.warn`
- 响应失败、或声明了非 `audio/*` 的内容类型，都算失败；没有声明类型不算错（`isAudioResponse`）
- 条数超过 `limit`（默认 `AUDIO_BUFFER_COUNT`，180）或解码后的 PCM 字节超过 `bytes`（默认 `AUDIO_BUFFER_BYTES`，64 MB）时，最久没用的先淘汰
- `retain(key)` 返回 `true` 的条目超限时保留

## 常见错误

- `acquire` 之后忘了 `release`：引用不归零，模型永远不会卸载
- 在 `unload` 里无条件释放图集页：共享同一页的其他模型会丢贴图，先看 `keep`
- 把 `acquire` 的结果当作已知类型：值由你的 `load` 决定，类型是 `unknown`，需要自己断言
