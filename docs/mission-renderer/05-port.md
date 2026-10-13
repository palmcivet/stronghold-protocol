---
title: 资源端口
description: createMissionResourcePort 按资源键申请图片、Spine、模型与 JSON，沿回退链加载、失败重试并做引用计数。
---

# 资源端口

画面不直接读文件，它通过**资源端口**按资源键（`AssetKey`）申请。键由 `arknights-assets-catalog` 定义，文件地址由它的解析器 `AssetResolver` 给出；加载函数由宿主提供。

```ts
import type { AssetResolver } from "arknights-assets-catalog"
import { createMissionResourcePort } from "arknights-mission-renderer"
import { TextureLoader } from "three"

export async function loadBoard(resolver: AssetResolver): Promise<void> {
  const textures = new TextureLoader()
  const port = createMissionResourcePort({
    resolver,
    image: (url) => textures.loadAsync(url),
    spine: async (source) => source.skel,
    model: async (url) => (await fetch(url)).text(),
    json: async (url) => (await fetch(url)).json(),
  })

  try {
    const texture = await port.image("texture:board/stone_D")
    console.log(texture.image)
  } finally {
    port.release("texture:board/stone_D")
  }
}
```

## 方法

| 方法 | 接受的键 |
| --- | --- |
| `image(key)` | `image`、`texture` |
| `spine(key)` | `spine` |
| `model(key)` | `model` |
| `json(key)` | `json` |
| `release(key, kind?)` | 任意 |

- `image`、`model`、`json` 取条目的 `main` 文件（没有时取第一个文件），把地址交给对应的加载函数
- `spine` 用 `spineSource` 取出 skel、atlas、全部图集页与元数据文件的地址，经 `arknights-assets-catalog` 的 Spine 缓存加载
- `release` 放掉一次引用；不传 `kind` 时由键推出，`texture` 按 `image` 处理
- 每次申请都要配一次 `release`，申请失败时也一样

## 加载函数

- `image(url, key, colorSpace)`：`colorSpace` 是实际加载的条目的颜色空间（回退命中时是回退条目），省略时为 `srgb`
- `spine(source)`：收到 `SpineSource`；可以直接用 `createMissionSkeletonLoader`，见 [演员](./06-actor.md#骨骼端口)
- `model(url, key)`、`json(url, key)`
- `retryDelays`：每次重试前等待的毫秒数，缺省 `[250, 1000]`
- `anisotropy`：`texture` 键的各向异性，缺省 1，通常取渲染器的最大值
- `spineCache`：Spine 缓存的其余参数，见 [缓存](../assets-catalog/06-cache.md#spine)

## 加载规则

- 键不在任何层里，或种类不被该方法接受时，返回被拒绝的 Promise
- 每个文件失败后按 `retryDelays` 依次等待再试；全部失败后把这一环记为失败，沿 `fallbackId` 解析下一环再加载；整条回退链都失败时拒绝
- 同一个键在同一种类下只加载一次：第二次申请返回同一个 Promise，引用计数加 1；引用归零时从缓存删除，再申请会重新加载
- 引用归零时，加载结果是 Three 的 `Texture` 就调用它的 `dispose`
- 图片、模型、JSON 的缓存按种类分开
- Spine 回退命中时，缓存里保存的是实际加载的键；释放请求的键时一并释放它

## 纹理策略

加载结果是 Three 的 `Texture` 时，端口按条目的种类统一设置 mipmap、过滤与各向异性（`MISSION_TEXTURE_POLICY`），使用方不再逐处设置：

| 种类 | mipmap | `minFilter` | 各向异性 |
| --- | --- | --- | --- |
| `texture` | 生成 | `LinearMipmapLinearFilter` | `anisotropy` |
| `image` | 不生成 | `LinearFilter` | 1 |

- `texture` 是棋盘的颜色、法线、粗糙度与遮罩图，斜着看并且被缩小
- `image` 是界面图与精灵，按接近原尺寸绘制
- 颜色空间：条目的 `colorSpace` 为 `srgb` 时设为 `SRGBColorSpace`，为 `linear` 时设为 `LinearSRGBColorSpace`，见 [包清单](../assets-catalog/03-manifest.md#包清单)
- 模型、JSON 与 Spine 没有纹理策略

## 谁在用端口

- 地面用 `image`、`model`、`json` 与 `release` 加载地形资源包，`MissionResourcePort` 可以直接传给地面的 `resources`
- 演员用 `spine` 与 `release` 加载模型
