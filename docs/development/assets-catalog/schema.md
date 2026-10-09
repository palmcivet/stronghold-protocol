---
title: 清单
description: 需求清单、原始目录、包清单与 Spine 侧车的类型和类型守卫。
---

# 清单

四种 JSON 文件的类型都定义在本包，提取方、打包方和运行时引用同一份。每种都有一对守卫：

| 文件 | 类型 | 守卫 |
| --- | --- | --- |
| 需求清单 | `NeedsList` | `isNeedsList`、`needsListIssues` |
| 原始目录 `catalog.json` | `RawCatalog` | `isRawCatalog`、`rawCatalogIssues` |
| 包清单 `manifest.json` | `PackManifest` | `isPackManifest`、`packManifestIssues` |
| Spine 侧车 | `SpineMeta` | `isSpineMeta`、`spineMetaIssues` |

`isXxx` 是类型守卫；`xxxIssues` 返回全部问题，每条带路径：

```ts
import { packManifestIssues } from "arknights-assets-catalog"

packManifestIssues(json)
// [{ path: 'assets["image:a"].files[0].hash', message: "expected a lowercase hex SHA-256" },
//  { path: "refs.chars.char_002_amiya.avatar", message: "invalid asset key: missing ':' between kind and path" }]
```

守卫不依赖第三方库，多余字段不报错。

## 文件条目

原始目录与包清单的每个条目都有 `files`，一项是一个文件：

```ts
interface AssetFile {
  readonly role: "main" | "skel" | "atlas" | "page" | "meta" | "fallback"
  readonly name: string | null // 多文件种类的文件名（含扩展名）；单文件种类为 null
  readonly format: "png" | "webp" | "skel" | "atlas" | "mp3" | "woff2" | "otf" | "ttf" | "obj" | "json"
  readonly bytes: number
  readonly hash: string // SHA-256，十六进制小写
}
```

守卫按种类检查文件组合：

| 种类 | 规则 |
| --- | --- |
| 单文件种类 | 角色为 `main` 或 `fallback`，至少一个 `main`；格式在 `SINGLE_FILE_FORMATS` 内且互不重复（同一格式会落到同一地址） |
| `spine` | 恰好一个 `skel`、一个 `atlas`，至少一个 `page`（png 或 webp），至多一个 `meta`（json）；文件名带对应扩展名，互不重复 |

## 需求清单

```ts
interface NeedsList {
  readonly schemaVersion: 1
  readonly pack: { readonly type: "base" | "season"; readonly id: string }
  readonly needs: readonly { readonly key: AssetKey; readonly required: boolean; readonly absent?: string }[]
}
```

同一个键只能列一次。`absent` 写明没有任何上游来源发布这个键的原因，必须是非空字符串，只能出现在可选需求上；提取报告把这类缺失键列入 `absentUpstream`。

## 原始目录

```ts
interface RawCatalog {
  readonly schemaVersion: 1
  readonly entries: Readonly<Record<AssetKey, RawEntry>>
  readonly missing: readonly MissingNeed[]
}

interface RawEntry {
  readonly key: AssetKey // 与记录键一致
  readonly kind: AssetKind // 与键的种类一致
  readonly files: readonly AssetFile[]
  readonly dependsOn: readonly AssetKey[]
  readonly source: { readonly id: string; readonly path: string; readonly revision: string | null }
}
```

## 包清单

基础、赛季、模组、本地与 upstream 覆盖清单使用同一格式。

```ts
interface PackManifest {
  readonly schemaVersion: 1
  readonly pack: { readonly type: PackType; readonly id: string; readonly version: string; readonly contentHash: string }
  readonly requires: readonly { readonly type: "base" | "season"; readonly id: string; readonly version: string }[]
  readonly fileRoot: string // 相对清单地址或绝对地址，以 / 结尾
  readonly assets: Readonly<Record<AssetKey, PackAsset>>
  readonly refs?: PackRefs // 叶子都是键
}

interface PackAsset {
  readonly kind: AssetKind
  readonly files: readonly PackFile[] // AssetFile 加可选的 href
  readonly dependsOn: readonly AssetKey[]
  readonly fallbackId: AssetKey | null
  readonly preloadGroup: string | null
}
```

- `pack.type` 为 `base`、`season`、`mod`、`local`、`upstream` 之一；`contentHash` 是 SHA-256。
- `href` 只给不按地址布局存放的文件；带 `href` 的文件 `hash` 可以是空串，表示不校验。
- 条目不能把 `fallbackId` 指向自己；更长的回退环由 [解析器](./resolver.md) 发现。
- `refs` 可以任意嵌套对象与数组，叶子必须是合法键；`packRefsIssues(refs)` 单独检查它。

## Spine 侧车

```ts
interface SpineMeta {
  readonly spineVersion: string
  readonly premultipliedAlpha: boolean
  readonly bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | null
  readonly animations: Readonly<Record<string, { readonly duration: number; readonly events: readonly { readonly name: string; readonly time: number }[] }>>
  readonly pages: readonly string[]
  readonly missingRegions: readonly string[]
}
```

侧车是 `spine` 条目的 `meta` 文件，也可以登记为 `json:spine-meta/<spine path>` 单独引用。
