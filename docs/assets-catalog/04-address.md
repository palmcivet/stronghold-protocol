---
title: 地址
description: 键与文件到相对地址的规则，以及按清单地址与 fileRoot 解析出带版本参数的绝对地址。
---

# 地址

每个文件有一个**相对地址**，由键和文件条目算出，所有种类同一套规则。运行时再把相对地址放到清单的 `fileRoot` 下，得到绝对地址。调用方不拼接文件路径。

## 最小示例

```ts
import { fileAddress, fileUrl } from "arknights-assets-catalog"

console.log(fileAddress("audio:bgm/battle", { name: null, format: "mp3" }))
// "audio/bgm/battle.mp3"
console.log(
  fileAddress("spine:enemy/slime", { name: "slime.atlas", format: "atlas" }),
) // "spine/enemy/slime/slime.atlas"

const url = fileUrl({
  manifestUrl: "https://cdn.example/packs/base/manifest.json",
  fileRoot: "../../files/",
  key: "audio:bgm/battle",
  file: {
    role: "main",
    name: null,
    format: "mp3",
    bytes: 912345,
    hash: "0123456789abcdef".repeat(4),
  },
})
console.log(url)
// "https://cdn.example/files/audio/bgm/battle.mp3?v=0123456789ab"
```

## 相对地址

| 种类 | 相对地址 |
| --- | --- |
| 单文件（image、texture、audio、font、model、json） | `<kind>/<path>.<format>` |
| 多文件（spine） | `spine/<path>/<name>` |

- Spine 的图集页与图集在同一目录，图集里的相对页名直接可用
- 多文件种类的 `name` 必须是不含 `/`、不以 `.` 开头的文件名
- 单文件种类的 `name` 必须是 `null`
- 违反以上两条时 `fileAddress` 抛 [`AssetAddressError`](./08-error.md#assetaddresserror)
- `isMultiFileKind(kind)` 判断一个种类是不是多文件种类（`MULTI_FILE_KINDS`）

## 绝对地址

`fileUrl` 按三步解析：

1. `fileRoot` 相对 `manifestUrl` 解析；`manifestUrl` 必须是绝对地址，否则 `URL` 构造抛 `TypeError`
2. 文件有 `href` 时用 `href`（绝对地址或相对 `fileRoot`），否则用相对地址
3. `hash` 非空时加**版本参数** `?v=<hash 前 12 位>`（`VERSION_PARAM`、`VERSION_HASH_LENGTH`）

```ts
import { fileUrl } from "arknights-assets-catalog"

const url = fileUrl({
  manifestUrl: "https://cdn.example/packs/mirror/manifest.json",
  fileRoot: "https://mirror.example/",
  key: "audio:bgm/battle",
  file: {
    role: "main",
    name: null,
    format: "mp3",
    bytes: 0,
    hash: "",
    href: "media/bgm/battle",
  },
})
console.log(url) // "https://mirror.example/media/bgm/battle"
```

规则：

- 版本参数随内容变化，带 `?v=` 的地址可以长期缓存
- 因为 `fileRoot` 相对清单地址解析，清单与文件可以整体换一个域名，地址不用改
- 几份清单的 `fileRoot` 指向同一个目录时，相同地址的文件只存一份
- 通过 [解析器](./05-resolver.md) 拿到的文件已经带好 `url`，一般不需要直接调用 `fileUrl`

## 常见错误

- 用相对地址作 `manifestUrl`：在浏览器里先用 `new URL(path, location.href)` 变成绝对地址
- 自己拼 `<kind>/<path>.<format>`：规则以后可能扩展到新种类，用 `fileAddress`
