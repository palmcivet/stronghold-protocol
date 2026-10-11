---
title: 资源端口
description: createMissionResourcePort 按资源键申请图片、Spine、模型与 JSON 句柄，沿回退链加载、失败重试并做引用计数。
---

# 资源端口

画面不直接读文件。它通过资源端口按资源键（`AssetKey`）申请句柄。键由 `arknights-assets-catalog` 定义，文件地址由它的解析器 `AssetResolver` 给出。

```ts
import { createMissionResourcePort } from "arknights-mission-renderer"

const port = createMissionResourcePort({
  resolver,
  image: (url) => textureLoader.loadAsync(url),
  spine: (source) => loadSpine(source.skel, source.atlas, source.pages),
  model: (url) => loadModel(url),
  json: async (url) => (await fetch(url)).json(),
})

const texture = await port.image("texture:map/autochess/TX_autochessi_D")
port.release("texture:map/autochess/TX_autochessi_D")
```

## 接口

```ts
interface MissionResourceLoaders<TImage, TSpine, TModel, TJson> {
  readonly resolver: AssetResolver
  readonly image: (url: string, key: AssetKey, colorSpace: AssetColorSpace) => Promise<TImage>
  readonly spine: (source: SpineSource) => Promise<TSpine>
  readonly model: (url: string, key: AssetKey) => Promise<TModel>
  readonly json: (url: string, key: AssetKey) => Promise<TJson>
  readonly retryDelays?: readonly number[] // 缺省 [250, 1000]
  readonly anisotropy?: number // texture 键的各向异性，通常取渲染器的最大值，缺省 1
  readonly spineCache?: Omit<SpineCacheOptions, "load">
}

interface MissionResourcePort<TImage, TSpine, TModel, TJson> {
  image(key: AssetKey): Promise<TImage>
  spine(key: AssetKey): Promise<TSpine>
  model(key: AssetKey): Promise<TModel>
  json(key: AssetKey): Promise<TJson>
  release(key: AssetKey, kind?: "image" | "spine" | "model" | "json"): void
}
```

| 方法 | 行为 |
| --- | --- |
| `image(key)` | 接受 `image` 与 `texture` 键。取条目的 `main` 文件（没有时取第一个文件）的地址交给 `image` 加载器 |
| `model(key)`、`json(key)` | 同上，分别只接受 `model`、`json` 键 |
| `spine(key)` | 只接受 `spine` 键。用 `spineSource` 取出 skel、atlas、全部图集页与侧车地址，经 `assets-catalog` 的 Spine 缓存加载 |
| `release(key, kind)` | 放掉一次引用。不传 `kind` 时由键推出：`texture` 按 `image` 处理 |

每次申请都要配一次 `release`，申请失败时也一样。

## 加载规则

- 键不在任何覆盖层里，或种类不被该方法接受时，返回被拒绝的 Promise。
- 每个文件加载失败后按 `retryDelays` 依次等待再试；全部失败后，把这一环记为失败，沿 `fallbackId` 解析下一环再加载。整条回退链都失败时拒绝。
- 同一个键在同一种类下只加载一次。第二次申请返回同一个 Promise，并把引用计数加 1；引用归零时从缓存删除，再申请会重新加载。
- 图片、模型、JSON 的缓存按种类分开，同一个键在不同种类之间互不影响。
- Spine 由 `createSpineCache` 管理。回退命中时，缓存里保存的是实际加载的那个键；释放请求的键时一并释放它。空闲淘汰、内存预算与卸载回调见 [缓存](../assets-catalog/05-cache.md#spine)，可用 `spineCache` 调整。

## 纹理策略

图片加载结果是 Three 的 `Texture` 时，端口按条目的种类一处设置颜色空间、mipmap 与各向异性（`MISSION_TEXTURE_POLICY`），使用方不再逐处设置：

| 种类 | mipmap | `minFilter` | 各向异性 |
| --- | --- | --- | --- |
| `texture`（棋盘颜色、法线、粗糙度、遮罩） | 生成 | `LinearMipmapLinearFilter` | `anisotropy` |
| `image`（界面与精灵） | 不生成 | `LinearFilter` | 1 |

棋盘贴图斜着看并且被缩小，需要 mipmap 与各向异性；界面图与精灵按接近原尺寸绘制。

资源目录的 `image`、`texture` 条目可以写 `colorSpace`（`srgb` 或 `linear`），省略时是 `srgb`，见 [资源目录格式](../assets-catalog/02-schema.md#包清单)。端口按实际加载的那个条目（回退命中时是回退条目）取得颜色空间，作为第三个参数交给 `image` 加载函数；加载结果是 Three 的 `Texture` 时，端口再把它的 `colorSpace` 设为 `SRGBColorSpace` 或 `LinearSRGBColorSpace`。模型、JSON 与 Spine 没有纹理策略。

## 地面使用的部分

地面通过端口的 `image`、`model`、`json` 与 `release` 加载地形资源包，`MissionResourcePort` 可以直接传给地面的 `resources`。图片、模型和 JSON 的对应关系见 [地面](./04-ground.md#地形资源包)。

## 骨骼

`spine` 加载函数可以直接用 `createMissionSkeletonLoader(runtime, fetch)`，这时资源端口的 Spine 缓存存放骨骼端口产出的 `MissionSkeletonData`。演员经 `spine(key)` 取得它，演员释放时调用 `release(key)`。见 [演员](./07-actor.md)。
