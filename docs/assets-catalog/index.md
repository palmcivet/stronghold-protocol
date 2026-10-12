---
title: 资源目录
description: arknights-assets-catalog 把资源键解析成文件地址：定义清单格式与守卫，把多份清单叠成覆盖层，并缓存 Spine 与音频。
---

# arknights-assets-catalog

`arknights-assets-catalog` 回答一个问题：**给定一个资源键，该去哪里取哪些文件**。

应用按键使用资源，例如 `image:avatar/knight`。文件放在哪里、有哪些格式、哪一层覆盖哪一层，都写在清单里。本包定义清单的格式，把多份清单叠成覆盖层，按键算出带版本参数的文件地址，并缓存加载好的 Spine 与音频。

## 边界

- 零运行时依赖，浏览器和 Node 都支持，不引用 `node:*`
- 不发请求、不读文件：清单由调用方加载，加载函数由调用方提供
- 不认识业务：领域 id 到键的映射写在清单的 `refs` 里，形状由写清单的一方决定
- 不规定发布位置：清单放在哪个地址、每层叫什么类型，由使用方决定

## 最小示例

```ts
import { createAssetResolver, isPackManifest } from "arknights-assets-catalog"

const manifestUrl = "https://cdn.example/packs/base/manifest.json"
const manifest: unknown = await (await fetch(manifestUrl)).json()
if (!isPackManifest(manifest)) {
  throw new Error(`not a pack manifest: ${manifestUrl}`)
}

const resolver = createAssetResolver([{ manifest, url: manifestUrl }])

const key = resolver.ref("heroes.knight.avatar")
console.log(key) // "image:avatar/knight"
const avatar = key ? resolver.resolve(key) : null
console.log(avatar?.files[0]?.url)
// "https://cdn.example/files/image/avatar/knight.png?v=9f9f9f9f9f9f"
```

清单的内容见 [快速开始](./01-quick-start.md)。

## 核心概念

- [资源键](./02-key.md)：`<kind>:<path>`，资源唯一的身份
- [清单](./03-manifest.md)：需求清单、原始清单、包清单与 Spine 元数据，以及检查它们的守卫
- [地址](./04-address.md)：键与文件到相对地址，再按清单解析成绝对地址
- [解析](./05-resolver.md)：多份包清单叠成覆盖层，按键查找，沿回退链取下一个
- [缓存](./06-cache.md)：以键为缓存键的 Spine 句柄缓存与音频解码缓存

## 下一步

- 从零跑通一遍：[快速开始](./01-quick-start.md)
- 查接口：[核心接口](./07-api.md)
- 了解整体设计：[架构设计](./09-architecture.md)
