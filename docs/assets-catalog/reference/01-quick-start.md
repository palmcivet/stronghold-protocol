---
title: 快速开始
description: 写一份包清单，校验它，建立解析器，按键取得文件地址，再用 Spine 缓存加载一个模型。
---

# 快速开始

这一页从零开始：写一份包清单，按键拿到图片地址，再加载一个 Spine 模型。

## 1. 写一份包清单

包清单是一个 JSON 文件，列出每个键对应的文件。把它放在 `https://cdn.example/packs/base/manifest.json`：

```json
{
  "schemaVersion": 1,
  "pack": {
    "type": "base",
    "id": "demo",
    "version": "1.0.0",
    "contentHash": "9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f"
  },
  "requires": [],
  "fileRoot": "../../files/",
  "assets": {
    "image:avatar/knight": {
      "kind": "image",
      "files": [
        {
          "role": "main",
          "name": null,
          "format": "png",
          "bytes": 20817,
          "hash": "9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f"
        }
      ],
      "dependsOn": [],
      "fallbackId": "image:avatar/default",
      "preloadGroup": "lobby"
    },
    "image:avatar/default": {
      "kind": "image",
      "files": [
        {
          "role": "main",
          "name": null,
          "format": "png",
          "bytes": 1024,
          "hash": "9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f"
        }
      ],
      "dependsOn": [],
      "fallbackId": null,
      "preloadGroup": null
    },
    "spine:enemy/slime": {
      "kind": "spine",
      "files": [
        {
          "role": "skel",
          "name": "slime.skel",
          "format": "skel",
          "bytes": 48211,
          "hash": "9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f"
        },
        {
          "role": "atlas",
          "name": "slime.atlas",
          "format": "atlas",
          "bytes": 1302,
          "hash": "9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f"
        },
        {
          "role": "page",
          "name": "slime.png",
          "format": "png",
          "bytes": 210337,
          "hash": "9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f"
        }
      ],
      "dependsOn": [],
      "fallbackId": null,
      "preloadGroup": null
    },
    "audio:bgm/battle": {
      "kind": "audio",
      "files": [
        {
          "role": "main",
          "name": null,
          "format": "mp3",
          "bytes": 912345,
          "hash": "9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f"
        }
      ],
      "dependsOn": [],
      "fallbackId": null,
      "preloadGroup": null
    }
  },
  "refs": {
    "heroes": { "knight": { "avatar": "image:avatar/knight" } },
    "enemies": { "slime": { "spine": "spine:enemy/slime" } },
    "music": ["audio:bgm/battle"]
  }
}
```

- `assets` 的键是资源键，值是这个资源的文件
- `hash` 是文件内容的 SHA-256；这里所有文件用同一个示例值
- `fileRoot` 相对清单地址解析，这份清单的文件都在 `https://cdn.example/files/` 下
- `refs` 是你自己的领域 id 到键的映射，形状随意，叶子必须是键

文件按 [地址规则](./04-address.md) 摆放，例如 `files/image/avatar/knight.png`、`files/spine/enemy/slime/slime.skel`。

## 2. 加载并校验

清单来自网络，先用守卫检查。`packManifestIssues` 列出全部问题，没有问题时返回空数组：

```ts
import {
  createAssetResolver,
  createSpineCache,
  packManifestIssues,
  spineSource,
  type PackManifest,
} from "arknights-assets-catalog"

const manifestUrl = "https://cdn.example/packs/base/manifest.json"
const json: unknown = await (await fetch(manifestUrl)).json()
const issues = packManifestIssues(json)
console.log(issues) // []
if (issues.length > 0) {
  throw new Error(`not a pack manifest: ${issues[0]?.path}`)
}
const manifest = json as PackManifest
```

结果：`manifest` 是通过检查的 `PackManifest`。只要一个布尔结果时，用 `isPackManifest`。

## 3. 建立解析器，按键取地址

`createAssetResolver` 接收一组层，每层是一份清单和它的绝对地址：

```ts
const resolver = createAssetResolver([{ manifest, url: manifestUrl }])

const avatar = resolver.resolve("image:avatar/knight")
console.log(avatar?.files[0]?.url)
// "https://cdn.example/files/image/avatar/knight.png?v=9f9f9f9f9f9f"
```

结果：每个文件多了绝对地址 `url`，末尾的 `?v=` 是哈希前 12 位，内容变了地址就变。

## 4. 用 refs 找键

业务代码通常只知道领域 id。用 `ref` 按路径取键：

```ts
const slimeKey = resolver.ref("enemies.slime.spine")
console.log(slimeKey) // "spine:enemy/slime"
console.log(resolver.ref("music.0")) // "audio:bgm/battle"
```

结果：路径不存在、或停在对象和数组上时返回 `null`。

## 5. 用 Spine 缓存加载模型

Spine 缓存按键保存加载结果，同一个键只加载一次。加载函数由你提供；这里只取回文件内容，真实项目里把它们交给 Spine 运行时解析：

```ts
const spines = createSpineCache({
  load: async (source) => ({
    skel: await (await fetch(source.skel)).arrayBuffer(),
    atlas: await (await fetch(source.atlas)).text(),
    pages: await Promise.all(
      source.pages.map(async (page) => (await fetch(page)).blob()),
    ),
  }),
})

const slime = slimeKey ? resolver.resolve(slimeKey) : null
const source = slime ? spineSource(slime) : null
if (source) {
  const model = await spines.acquire(source)
  console.log(spines.peek(source.key) === model) // true
  spines.release(source.key)
}
```

结果：`acquire` 取得一次引用，用完 `release`。引用全部放掉后，模型在缓存里留一段时间再卸载，见 [缓存](./06-cache.md)。

## 下一步

- 资源键的语法：[资源键](./02-key.md)
- 多份清单叠加与回退：[解析](./05-resolver.md)
- 全部核心接口：[核心接口](./07-api.md)
