---
title: 解析
description: 多份包清单叠成覆盖层，按键查找条目，沿 fallbackId 回退，展开依赖，合并 refs。
---

# 解析

`createAssetResolver` 把多份包清单叠成**覆盖层**：每份清单是一**层**，按键查找时取最高一层的条目。条目可以用 `fallbackId` 指向另一个键，组成**回退链**，加载失败时沿链取下一个。

## 最小示例

```ts
import {
  createAssetResolver,
  isPackManifest,
  type AssetKey,
  type PackManifest,
  type ResolvedAsset,
} from "arknights-assets-catalog"

const baseUrl = "https://cdn.example/packs/base/manifest.json"
const base: unknown = await (await fetch(baseUrl)).json()
if (!isPackManifest(base)) {
  throw new Error(`not a pack manifest: ${baseUrl}`)
}

const patch: PackManifest = {
  schemaVersion: 1,
  pack: {
    type: "patch",
    id: "winter",
    version: "1",
    contentHash: "ab".repeat(32),
  },
  requires: [],
  fileRoot: "./files/",
  assets: {
    "image:avatar/knight": {
      kind: "image",
      files: [
        {
          role: "main",
          name: null,
          format: "webp",
          bytes: 9001,
          hash: "ab".repeat(32),
        },
      ],
      dependsOn: [],
      fallbackId: null,
      preloadGroup: null,
    },
  },
  refs: { heroes: { knight: { winter: "image:avatar/knight" } } },
}

const resolver = createAssetResolver([
  { manifest: base, url: baseUrl },
  { manifest: patch, url: "https://cdn.example/patches/winter/manifest.json" },
])

const knight = resolver.resolve("image:avatar/knight")
console.log(knight?.pack.type) // "patch"
console.log(knight?.files[0]?.url)
// "https://cdn.example/patches/winter/files/image/avatar/knight.webp?v=abababababab"
```

## 覆盖层

- 数组从低到高，后面的层盖住前面的层。常见的顺序是底层 < 扩展 < 本地覆盖，具体由调用方决定
- 同一个键，高层的条目整条替换低层的条目，不做字段合并
- 每份清单先过包清单守卫，不合法时抛 `AssetResolveError`，`code` 为 `invalid-manifest`，`issues` 列出全部问题
- 层的 `url` 必须是绝对地址，否则 `code` 为 `invalid-url`
- 层的 `pack.type` 是任意非空字符串，解析器不按类型区别对待

## 查找与回退

接上例：

```ts
console.log(resolver.entry("image:avatar/default")?.key)
// "image:avatar/default"
console.log(resolver.chain("image:avatar/default").length) // 1
console.log(resolver.has("image:avatar/missing")) // false
```

- `entry(key)`：这个键自己的条目，不回退
- `chain(key)`：这个键的条目，再沿 `fallbackId` 依次列出
- `resolve(key)`：回退链上第一个条目
- `resolve(key, { failed })`：跳过加载失败过的键
- 每一环都取该键在最高层的条目；没有条目的键结束回退链
- 回退链有环时抛 `AssetResolveError`，`code` 为 `fallback-cycle`；环可以跨层
- 回退目标的种类必须与起点相同，否则 `code` 为 `fallback-kind`

加载失败时，把失败的键记下来，再解析一次。接上例：

```ts
async function loadImage(asset: ResolvedAsset): Promise<Blob | null> {
  const response = await fetch(asset.files[0]?.url ?? "")
  return response.ok ? response.blob() : null
}

const failed = new Set<AssetKey>()
let image: Blob | null = null
for (;;) {
  const asset = resolver.resolve("image:avatar/knight", { failed })
  if (!asset) {
    break
  }
  image = await loadImage(asset)
  if (image) {
    break
  }
  failed.add(asset.key)
}
console.log(image !== null) // true
```

`resolve` 的结果 `ResolvedAsset`：

- `key`、`kind`：实际命中的键与种类，回退后可能不是请求的键
- `asset`：清单里的原条目
- `pack`：提供这个条目的那一层的清单头
- `files`：条目的文件，每项多一个绝对地址 `url`，见 [地址](./04-address.md)

## 依赖

`dependencies(key)` 沿 `dependsOn` 递归展开依赖。每个依赖按自己的回退链解析；结果去重，没有条目的依赖跳过。

## refs

`refs` 把领域 id 映射到键。各层的 `refs` 按 JSON 路径合并：

- 对象逐字段合并
- 键或数组在高层出现时整体替换

接上例：

```ts
console.log(resolver.ref("heroes.knight.avatar")) // "image:avatar/knight"
console.log(resolver.ref("heroes.knight.winter")) // "image:avatar/knight"
console.log(resolver.ref(["music", "0"])) // "audio:bgm/battle"
console.log(resolver.ref("heroes.knight")) // null
```

- `resolver.refs` 是合并后的整棵树
- 路径可以写成 `.` 分隔的字符串，也可以写成数组；数组按下标取
- 路径缺失、或停在对象和数组上时，`ref` 返回 `null`
- 同样的逻辑也单独导出：`mergeRefs`、`refNodeAt`、`refKeyAt`

## 常见错误

- 把清单的相对路径当作层的 `url`：先转成绝对地址
- 以为高层只改了一个字段：同一个键整条替换，要保留的字段也得写上
- 在两个键之间互设 `fallbackId`：解析到这条链时抛 `fallback-cycle`
