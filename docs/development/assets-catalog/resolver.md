---
title: 解析
description: 多份包清单叠成覆盖层，按键查找条目，沿 fallbackId 回退，合并 refs。
---

# 解析

`createAssetResolver` 把多份包清单叠成一个虚拟文件系统。

```ts
import { createAssetResolver } from "arknights-assets-catalog"

const resolver = createAssetResolver([
  { manifest: base, url: baseUrl },
  { manifest: season, url: seasonUrl },
  { manifest: mod, url: modUrl },
  { manifest: local, url: localUrl },
])
```

- 数组从低到高：后面的层盖住前面的层。通常的顺序是基础 < 赛季 < 模组（按加载顺序）< 本地；连接上游后端时可以是 next 基础 < upstream < 本地。顺序由调用方决定。
- 同一键，高层的条目整条替换低层的条目，不做字段合并。
- 每份清单先过 `packManifestIssues`（包括 `refs` 叶子校验），不合法抛 `AssetResolveError`（`code: "invalid-manifest"`，`issues` 列出全部问题）；清单地址不是绝对地址时 `code` 为 `"invalid-url"`。
- 查找按键建 `Map`，文件地址在第一次取用时算出并缓存。

## 查找与回退

```ts
resolver.entry(key) // 这个键自己的条目，不回退
resolver.chain(key) // 这个键的条目，再沿 fallbackId 依次列出
resolver.resolve(key) // 回退链上第一个条目
resolver.resolve(key, { failed }) // 跳过加载失败过的键
```

```ts
const failed = new Set<AssetKey>()
for (;;) {
  const asset = resolver.resolve(key, { failed })
  if (!asset) break // 整条链都不可用
  if (await load(asset)) break
  failed.add(asset.key)
}
```

- 每一环取该键在最高层的条目。没有条目的键结束回退链。
- 回退链有环时抛 `AssetResolveError`，`code` 为 `"fallback-cycle"`，消息列出整条环；环可以跨层。
- 回退目标的种类必须与起点相同，否则 `code` 为 `"fallback-kind"`。

解析结果 `ResolvedAsset`：

| 字段 | 说明 |
| --- | --- |
| `key`、`kind` | 实际命中的键与种类（回退后可能不是请求的键） |
| `asset` | 清单里的原条目 |
| `pack` | 提供该条目的清单头 |
| `files` | 条目文件，每项多一个绝对地址 `url`，见 [地址](./address.md) |

`dependencies(key)` 沿 `dependsOn` 递归展开依赖，每个依赖按自己的回退链解析；结果去重，缺失的依赖跳过。

## refs

`refs` 把领域 id 映射到键。各层的 `refs` 按 JSON 路径合并：对象逐字段合并，键或数组在高层出现时整体替换。

```ts
resolver.refs // 合并后的整棵树
resolver.ref("chars.char_002_amiya.spine") // "spine:skin/char_002_amiya_1/front"
resolver.ref(["voices", "0"]) // 数组按下标
```

路径缺失或停在对象、数组上时 `ref` 返回 `null`。同样的函数也单独导出：`mergeRefs`、`refNodeAt`、`refKeyAt`。
