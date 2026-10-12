---
title: 清单
description: 需求清单、原始清单、包清单与 Spine 元数据四种文件的用途、关键字段，以及检查它们的守卫。
---

# 清单

本包定义四种 JSON 文件的格式。写文件的一方和读文件的一方引用同一份类型，并用同一组守卫检查：

- **需求清单** `NeedsList`：打包方写，提取工具读。列出一个包要哪些键
- **原始清单** `RawCatalog`：提取工具写，打包方读。记下取到的每个资源的文件与来源
- **包清单** `PackManifest`：打包方写，运行时读。解析器按它把键解析成文件地址
- **Spine 元数据** `SpineMeta`：提取工具写，运行时读。记下从 Spine 骨架里读出的事实

提取工具见 [arknights-assets-extractor](../assets-extractor/index.md)；本包只定义格式，不读写文件。

## 守卫

**守卫**是一对检查函数：`isXxx` 是类型守卫，`xxxIssues` 返回全部问题，每条带指向出错字段的路径。

```ts
import { isPackManifest, packManifestIssues } from "arknights-assets-catalog"

const json: unknown = {
  schemaVersion: 1,
  pack: { type: "base", id: "demo", version: "1.0.0", contentHash: "x" },
  requires: [],
  fileRoot: "../../files",
  assets: {},
}

console.log(isPackManifest(json)) // false
console.log(packManifestIssues(json))
// [
//   { "path": "pack.contentHash", "message": "expected a lowercase hex SHA-256" },
//   { "path": "fileRoot", "message": "expected a trailing '/'" },
// ]
```

| 文件 | 类型 | 守卫 |
| --- | --- | --- |
| 需求清单 | `NeedsList` | `isNeedsList`、`needsListIssues` |
| 原始清单 | `RawCatalog` | `isRawCatalog`、`rawCatalogIssues` |
| 包清单 | `PackManifest` | `isPackManifest`、`packManifestIssues` |
| Spine 元数据 | `SpineMeta` | `isSpineMeta`、`spineMetaIssues` |

- 守卫只看形状与规则，多余字段不报错
- 守卫不依赖第三方库，浏览器里也能用
- 一次报出全部问题，便于一次改完；`SchemaIssue` 是 `{ path, message }`

## 文件条目

原始清单与包清单的每个条目都有 `files`，一项是一个文件：

- `role`：文件在条目里的用途。单文件种类用 `main`、`fallback`；`spine` 用 `skel`、`atlas`、`page`、`meta`
- `name`：多文件种类的文件名，带扩展名；单文件种类为 `null`
- `format`：`png`、`webp`、`skel`、`atlas`、`mp3`、`woff2`、`otf`、`ttf`、`obj`、`json` 之一
- `bytes`：字节数
- `hash`：内容的 SHA-256，小写十六进制

守卫按种类检查文件组合：

- 单文件种类：至少一个 `main`；格式在该种类允许的范围内（`SINGLE_FILE_FORMATS`），且互不重复，因为同一格式会落到同一地址
- `spine`：恰好一个 `skel`、一个 `atlas`，至少一个 `page`（png 或 webp），至多一个 `meta`（json）；文件名带对应扩展名，互不重复

## 包清单

包清单是覆盖层的一层，见 [解析](./05-resolver.md)。关键字段：

- `pack`：清单头。`type` 与 `id` 是任意非空字符串，由写清单的一方命名；`contentHash` 是 SHA-256
- `requires`：这一层依赖的其他包，每项是 `{ type, id, version }`，`type` 同样是任意非空字符串
- `fileRoot`：文件根，相对清单地址或绝对地址，以 `/` 结尾
- `assets`：键到条目。条目有 `kind`、`files`、`dependsOn`、`fallbackId`、`preloadGroup`，图像可有 `colorSpace`
- `refs`：可选。领域 id 到键的映射，可以任意嵌套对象与数组，叶子必须是合法键

规则：

- 本包不限定 `pack.type` 的取值。哪些类型可以出现、能依赖哪些类型，由使用方自己校验
- 条目的种类必须与键的种类一致
- `fallbackId` 不能指向自己；更长的回退环由解析器发现
- 文件可以带 `href`，指向不按地址规则存放的位置；带 `href` 的文件 `hash` 可以是空串，表示不校验
- `colorSpace` 说明图像颜色通道的编码，只有 `image`、`texture` 可以写；省略时是 `srgb`，法线、粗糙度这类数据贴图写 `linear`
- `assetColorSpace(entry)` 给出生效的颜色空间，其余种类给 `null`
- `packRefsIssues(refs)` 单独检查 `refs`

完整字段见 [核心接口](./07-api.md#校验清单)。

## 需求清单

需求清单告诉提取工具一个包要哪些键：

```ts
import { needsListIssues, type NeedsList } from "arknights-assets-catalog"

const needs: NeedsList = {
  schemaVersion: 1,
  pack: { type: "base", id: "demo" },
  needs: [
    { key: "image:avatar/knight", required: true },
    {
      key: "texture:board/stone_D",
      required: false,
      absent: "only in the game client",
    },
  ],
}

console.log(needsListIssues(needs)) // []
```

- `pack.type` 与 `pack.id` 是任意非空字符串，由写清单的一方命名；本包不限定取值
- 同一个键只能列一次
- `required` 为 `true` 的键缺失时，提取失败；可选键缺失时只出现在报告里
- `absent` 写明为什么没有任何来源发布这个键，只能出现在可选需求上；提取报告怎样列出这类键见 [arknights-assets-extractor 的报告](../assets-extractor/04-output.md#报告-report-json)

## 原始清单

原始清单是提取的结果：`entries` 是键到条目，`missing` 是没能取到的需求。条目与包清单的条目共用文件规则，另有：

- `source`：来源 `{ id, path, revision }`，`revision` 未知时为 `null`
- `dependsOn`：这个资源依赖的其他键，例如材质依赖的贴图
- 记录键必须与条目里的 `key` 一致

## Spine 元数据

**Spine 元数据**是从骨架里读出的事实，供运行时在加载骨架之前使用：

- `spineVersion`、`premultipliedAlpha`
- `bounds`：包围盒，读不出时为 `null`
- `animations`：动画名到时长（秒）与事件
- `pages`：图集页文件名
- `missingRegions`：图集里缺失的区域名

Spine 元数据是 `spine` 条目的 `meta` 文件，也可以登记为 `json:spine-meta/<spine path>` 单独引用。

## 常见错误

- 把 `fileRoot` 写成 `../../files`：必须以 `/` 结尾
- 在 `refs` 里写文件路径：叶子必须是键，地址由解析器算出
- 用 `as PackManifest` 跳过守卫：之后的错误会在解析器里以 [`invalid-manifest`](./08-error.md#assetresolveerror) 出现
