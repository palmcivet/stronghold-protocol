---
title: 资源键
description: 资源键 AssetKey 的语法、种类与解析函数。
---

# 资源键

资源键是资源的身份，写作 `<kind>:<path>`，不带扩展名。清单、解析器和缓存之间只传键；种类从键推出，文件地址由键算出。

```text
image:avatar/knight
spine:enemy/slime
audio:voice/cn/knight/greeting
font:bender/regular
texture:board/stone_D
model:board/frame
json:spine-meta/enemy/slime
```

## 最小示例

```ts
import {
  formatAssetKey,
  isAssetKey,
  parseAssetKey,
} from "arknights-assets-catalog"

console.log(isAssetKey("image:avatar/knight")) // true
console.log(isAssetKey("image:avatar/knight.png")) // false

const parsed = parseAssetKey("audio:voice/cn/knight/greeting")
console.log(parsed.kind) // "audio"
console.log(parsed.namespace) // "voice"
console.log(parsed.segments) // ["voice", "cn", "knight", "greeting"]

console.log(formatAssetKey("spine", "enemy/slime")) // "spine:enemy/slime"
```

## 语法

```text
key      = kind ":" path
kind     = "image" | "texture" | "spine" | "audio" | "font" | "model" | "json"
path     = segment *( "/" segment )
segment  = 1*( ALPHA / DIGIT / "_" / "-" )
```

- 区分大小写，保留来源的大小写，例如 `texture:board/stone_D`
- 段内不允许 `.`，所以键里没有扩展名，也不会出现 `..`
- 空格、`[`、`]`、`#`、`?`、`\` 都不合法
- 最多 8 段（`ASSET_PATH_MAX_SEGMENTS`）
- 整个键含 `<kind>:` 不超过 200 字符（`ASSET_KEY_MAX_LENGTH`）
- 变体写进路径，例如 `image:avatar/knight_2`
- 第一段叫**命名空间**。本包只校验语法，命名空间的含义由使用方约定

## 种类

| kind | 用途 | 文件 |
| --- | --- | --- |
| `image` | 界面与二维图 | 单文件 png 或 webp |
| `texture` | 三维材质贴图 | 单文件，可以同时有 png 与 webp |
| `spine` | Spine 3.8 模型 | 多文件：skel、atlas、图集页，可附 Spine 元数据 |
| `audio` | 音乐、音效、语音 | 单文件 mp3 |
| `font` | 字体 | woff2，可附 otf 或 ttf |
| `model` | 网格 | 单文件 obj |
| `json` | 结构化数据 | 单文件 json |

`ASSET_KINDS` 是种类表，`isAssetKind` 检查一个值是不是种类。

## 规则

- 来自外部的字符串先过 `isAssetKey` 或 `parseAssetKey`，再当作键使用
- 类型 `AssetKey` 是模板字面量 `` `${AssetKind}:${string}` ``，可以作 `Record` 的键；它只约束形状，不保证合法
- `parseAssetKey`、`formatAssetKey` 遇到不合法的键抛 [`AssetKeyError`](./08-error.md#assetkeyerror)
- 只想知道原因、不想抛错时，用 `assetKeyIssue`：合法时返回 `null`
- 已知合法的键，用 `assetKindOf`、`assetPathOf` 取种类与路径

```ts
import { assetKeyIssue, assetKindOf } from "arknights-assets-catalog"

console.log(assetKeyIssue("image:avatar/knight.png"))
// "segment \"knight.png\" may only use letters, digits, '_' and '-'"
console.log(assetKeyIssue("sound:bgm/battle")) // "unknown kind \"sound\""
console.log(assetKindOf("audio:bgm/battle")) // "audio"
```

## 常见错误

- 把文件名当键：`image:avatar/knight.png` 不合法，扩展名由文件条目的 `format` 给出
- 用 `as AssetKey` 强转外部输入：类型通过了，解析时才抛错
- 同一份字节放在两个键下，以为会共用缓存：键是身份，两个键就是两个资源，见 [架构设计](../maintain/01-architecture.md#键是身份)
