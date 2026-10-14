---
title: 错误处理
description: 本包抛出的三个错误类、AssetResolveError 的错误码，以及守卫问题与缓存失败怎样报告。
---

# 错误处理

本包有两种报告问题的方式：

- **守卫**返回问题列表，不抛错。适合检查外部输入，见 [清单](./03-manifest.md#守卫)
- **错误类**在调用方违反约定时抛出。三个错误类都继承 `Error`，`name` 与类名相同

## 最小示例

```ts
import {
  AssetResolveError,
  createAssetResolver,
  type PackManifest,
} from "arknights-assets-catalog"

const broken = {
  schemaVersion: 1,
  pack: { type: "", id: "x", version: "1", contentHash: "" },
} as unknown as PackManifest

try {
  createAssetResolver([
    { manifest: broken, url: "https://cdn.example/broken/manifest.json" },
  ])
} catch (error) {
  if (!(error instanceof AssetResolveError)) {
    throw error
  }
  console.log(error.code) // "invalid-manifest"
  console.log(error.issues.map((issue) => issue.path))
  // ["pack.type", "pack.contentHash", "requires", "fileRoot", "assets"]
}
```

## `AssetKeyError`

键不合法时由 `parseAssetKey`、`formatAssetKey`、`assetKindOf`、`assetPathOf` 抛出。

- `value`：不合法的原值
- `message`：`invalid asset key "<value>": <原因>`，原因与 `assetKeyIssue` 相同

```ts
import { AssetKeyError, parseAssetKey } from "arknights-assets-catalog"

try {
  parseAssetKey("image:avatar/knight.png")
} catch (error) {
  console.log(error instanceof AssetKeyError) // true
  console.log((error as AssetKeyError).value) // "image:avatar/knight.png"
}
```

## `AssetAddressError`

`fileAddress` 拿到与种类不符的文件名时抛出：多文件种类缺少合法文件名，或单文件种类带了文件名。

```ts
import { AssetAddressError, fileAddress } from "arknights-assets-catalog"

try {
  fileAddress("spine:enemy/slime", { name: "../slime.skel", format: "skel" })
} catch (error) {
  console.log(error instanceof AssetAddressError) // true
}
```

## `AssetResolveError`

`createAssetResolver` 与解析器的方法抛出。按 `code` 区分：

- `invalid-manifest`：某一层没通过包清单守卫。`issues` 列出全部问题，`message` 写出第一条
- `invalid-url`：某一层的 `url` 不是绝对地址
- `fallback-cycle`：回退链有环。`message` 列出整条环
- `fallback-kind`：回退目标的种类与起点不同

`AssetResolveErrorCode` 是这四个值的联合类型。前两个在建立解析器时抛出，后两个在第一次走到那条回退链时由 `chain`、`resolve`、`dependencies` 抛出。

## 缓存的失败

缓存不抛本包的错误类：

- `SpineCache.acquire` 返回的 promise 会拒绝：`source` 不是合法的 `SpineSource` 时为 `no spine entry`；加载超时为 `load timeout: <key>`；其余是 `load` 自己抛出的错误
- 失败结果保留 `failTtl`，期间的 `acquire` 得到同一个失败
- `AudioBufferCache.load` 从不拒绝：失败得到 `null`，每个键只调用一次 `warn`
