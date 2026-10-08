---
title: 资源端口
description: createRendererResourcePort 按 AssetRef 申请图片、Spine 与模型句柄，按种类做引用计数；TerrainPackPort 是地面用到的子集。
---

# 资源端口

画面不直接读文件。它通过资源端口按 `AssetRef` 申请句柄，`AssetRef` 来自 `arknights-assets-catalog`，资源地址由 `ResourceResolver` 解析。

```ts
import { createRendererResourcePort } from "arknights-mission-renderer"

const port = createRendererResourcePort({
  resolver,
  origin: "https://assets.example.com",
  image: (url) => textureLoader.loadAsync(url),
  spine: (url) => loadSpine(url),
  model: (url) => loadModel(url),
})

const texture = await port.image(diffuseRef)
port.release(diffuseRef, "image")
```

## 接口

```ts
interface RendererResourceLoaders<TImage, TSpine, TModel> {
  readonly resolver: ResourceResolver
  readonly origin?: string
  readonly image: (url: string, ref: AssetRef) => Promise<TImage>
  readonly spine: (url: string, ref: AssetRef) => Promise<TSpine>
  readonly model?: (url: string, ref: AssetRef) => Promise<TModel>
}

interface RendererResourcePort<TImage, TSpine, TModel> {
  url(ref: AssetRef): string
  image(ref: AssetRef): Promise<TImage>
  spine(ref: AssetRef): Promise<TSpine>
  model(ref: AssetRef): Promise<TModel>
  release(ref: AssetRef, kind?: RendererAssetKind): void
}
```

`createRendererResourcePort` 返回的对象还多一个 `clear()`，见下文。`RendererAssetKind` 为 `"image"`、`"spine"`、`"model"`，包入口不导出这个类型。

| 方法 | 行为 |
| --- | --- |
| `url(ref)` | 用 `resolver.url(ref, origin)` 得到地址 |
| `image(ref)`、`spine(ref)` | 按 `ref.id` 查缓存。没有则调用加载器，有则复用，并把引用计数加 1 |
| `model(ref)` | 同上。没有配置 `model` 加载器时返回被拒绝的 Promise |
| `release(ref, kind)` | 引用计数减 1，归零时从缓存删除 |
| `clear()` | 清空全部缓存，不看引用计数 |

## 缓存规则

- 缓存按种类分开，同一个 `ref.id` 在 `image`、`spine`、`model` 之间互不影响。
- 同一个 `ref.id` 的第二次申请返回第一次的同一个 Promise。
- 加载失败的 Promise 也留在缓存里。引用归零之前，再次申请拿到的仍是那个失败的 Promise；归零后再申请会重新加载。
- `release` 只减少引用计数。归零时从缓存删除该项，不调用任何卸载逻辑。

`release` 的 `kind` 缺省为 `"spine"`。申请图片后释放时要传 `"image"`，否则释放不到图片的缓存项。

## TerrainPackPort

地面的地形资源包使用 `TerrainPackPort`。它是下面这些字段的结构类型：

```ts
interface TerrainPackPort {
  readonly image?: (ref: AssetRef) => Promise<unknown>
  readonly model?: (ref: AssetRef) => Promise<unknown>
  readonly json?: (ref: AssetRef) => Promise<unknown>
  readonly release: (ref: AssetRef, kind?: RendererAssetKind) => void
}
```

`RendererResourcePort` 可以直接传给地面的 `resources`，它提供 `image`、`model` 和 `release`。它没有 `json`，所以预制件表（`gatePrefab`）与 `tiles.json` 不会被加载。需要它们时，宿主额外提供 `json`：

```ts
const resources = { ...port, json: (ref) => loadJson(port.url(ref)) }
```

`json` 不进入缓存，由宿主自己决定是否缓存。

图片、模型和 JSON 的对应关系见 [地面](./ground.md#地形资源包)。
