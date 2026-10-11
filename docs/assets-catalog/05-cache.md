---
title: 缓存
description: 以资源键为缓存键的 Spine 句柄缓存与音频解码缓存。
---

# 缓存

两个缓存都以 `AssetKey` 为缓存键：同一份字节在两个键下是两条缓存，同一个键只加载一次。文件地址来自 [解析器](./04-resolver.md)。

## Spine

```ts
import { createSpineCache, spineSource } from "arknights-assets-catalog"

const cache = createSpineCache({
  load: async (source, context) => loadSkeleton(source.skel, source.atlas, source.pages),
  unload: (source, skeleton, keep) => disposeSkeleton(skeleton, keep),
})

const resolved = resolver.resolve("spine:enemy/enemy_1007_slime")
const source = resolved ? spineSource(resolved) : null
if (source) {
  const skeleton = await cache.acquire(source)
  // …
  cache.release(source.key)
}
```

`spineSource(resolved)` 从条目文件中取出 `skel`、`atlas`、全部 `page` 与可选的 `meta` 地址；条目不是 `spine` 或缺文件时返回 `null`。`acquire` 收到不合法的 `SpineSource` 时拒绝（`no spine entry`）。

| 方法 | 作用 |
| --- | --- |
| `acquire(source, { retry })` | 取得一次引用；并发请求共用一次加载 |
| `release(key)` | 放掉一次引用 |
| `peek(key)` | 已就绪的值，不改变引用 |
| `restart(source)` | 加载中时重开一次尝试 |
| `hold()` | 场景马上还会再用，暂停安静计时；返回的函数解除 |
| `stats()`、`clear()` | 统计与全部卸载 |

- 有引用的骨架不淘汰。空闲骨架先受条数（`max`，默认 60）限制，再受估算字节预算（`SPINE_IDLE_BYTES`）限制，释放后有一段宽限期。
- 卸载回调的 `keep` 是其他仍在缓存里的骨架还在用的图集页地址，调用方据此保留共享贴图。
- 卸载还没结束时，同一键的下一次加载会等它，不会把旧值交出去。
- 失败会被记住一段时间（`failTtl`），之后或 `retry` 时重新加载。
- 默认定时器在浏览器与 Node 中都能用；测试可注入 `now` 与 `timers`。

## 音频

```ts
import { audioSource, createAudioBuffer } from "arknights-assets-catalog"

const audio = createAudioBuffer({
  fetch: (url) => fetch(url),
  decode: (bytes) => context.decodeAudioData(bytes),
})

const resolved = resolver.resolve("audio:bgm/m_bat_autochess_loop")
const source = resolved ? audioSource(resolved) : null
const buffer = source ? await audio.load(source) : null
```

- `load` 按 `source.url` 请求并解码，结果按 `source.key` 缓存。失败返回 `null`，每个键只警告一次。
- 响应失败、或声明了非 `audio/*` 的内容类型（例如开发服务器回落的 HTML 页面），都算失败；没声明类型不算错。
- 按插入先后淘汰：条数上限 `AUDIO_BUFFER_COUNT`，解码后 PCM 字节预算 `AUDIO_BUFFER_BYTES`；`retain(key)` 返回 true 的条目超预算时保留。
