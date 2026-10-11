---
title: 资源键
description: AssetKey 的语法、种类与解析函数。
---

# 资源键

资源键是资源的身份：`<kind>:<path>`，不带扩展名。

```text
image:char/avatar/char_002_amiya
spine:enemy/enemy_1007_slime
audio:bgm/m_bat_autochess_loop
font:bender/regular
texture:map/autochess/TX_autochessi_D
model:mesh/autochess/board_frame
json:spine-meta/enemy/enemy_1007_slime
```

## 语法

```text
key      = kind ":" path
kind     = "image" | "texture" | "spine" | "audio" | "font" | "model" | "json"
path     = segment *( "/" segment )
segment  = 1*( ALPHA / DIGIT / "_" / "-" )
```

- 区分大小写，保留上游大小写（`TX_autochessi_D`）。
- 段内不允许 `.`，所以键里没有扩展名，也不会出现 `..`；空格、`[`、`]`、`#`、`?`、`\` 都不合法。
- 最多 8 段（`ASSET_PATH_MAX_SEGMENTS`）；整个键（含 `<kind>:`）不超过 200 字符（`ASSET_KEY_MAX_LENGTH`）。
- 变体写进路径：`image:char/avatar/char_002_amiya_2`、`audio:voice/cn/...`。
- 第一段叫命名空间。本包只校验语法；哪些命名空间进基础包、哪些进赛季包，由打包方校验。

## 种类

| kind | 用途 | 文件 |
| --- | --- | --- |
| `image` | 界面与二维图 | 单文件 png 或 webp |
| `texture` | 三维棋盘的材质贴图 | 单文件，可同时有 png 与 webp |
| `spine` | Spine 3.8 模型 | 多文件：skel、atlas、图集页，可附 `SpineMeta` 侧车 |
| `audio` | BGM、音效、语音 | 单文件 mp3 |
| `font` | 字体 | woff2，可附 otf 或 ttf |
| `model` | 网格 | 单文件 obj |
| `json` | 结构化侧车 | 单文件 json |

`ASSET_KINDS` 是种类表。新增种类时同时改这张表与 [地址](./03-address.md) 的文件规则。

## API

```ts
import { assetKeyIssue, formatAssetKey, isAssetKey, parseAssetKey, type AssetKey } from "arknights-assets-catalog"

isAssetKey("image:char/avatar/char_002_amiya") // true
assetKeyIssue("image:char/avatar/x.png") // 'segment "x.png" may only use letters, digits, \'_\' and \'-\''

parseAssetKey("audio:voice/cn/char_002_amiya/CN_001")
// { key, kind: "audio", path: "voice/cn/char_002_amiya/CN_001",
//   segments: ["voice", "cn", "char_002_amiya", "CN_001"], namespace: "voice" }

formatAssetKey("spine", "enemy/enemy_1007_slime") // "spine:enemy/enemy_1007_slime"
```

| 函数 | 作用 |
| --- | --- |
| `isAssetKey(value)` | 类型守卫 |
| `assetKeyIssue(value)` | 不合法的原因，合法时为 `null` |
| `parseAssetKey(key)` | 拆出种类、路径、段与命名空间；不合法时抛 `AssetKeyError` |
| `formatAssetKey(kind, path)` | 拼出键并校验 |
| `assetKindOf(key)`、`assetPathOf(key)` | 取种类、取路径 |
| `isAssetKind(value)` | 种类守卫 |

类型 `AssetKey` 是模板字面量 `` `${AssetKind}:${string}` ``，可以直接作 `Record` 的键；它只约束形状，来自外部的字符串要先过 `isAssetKey`。
