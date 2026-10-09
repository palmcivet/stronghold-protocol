---
title: 地址
description: 键与文件到相对地址，以及包清单的发布布局。
---

# 地址

所有资源路径都由本包计算，其他代码不拼接资源路径。

## 文件地址

| 种类 | 相对地址 |
| --- | --- |
| 单文件（image、texture、audio、font、model、json） | `<kind>/<path>.<format>` |
| 多文件（spine） | `spine/<path>/<name>` |

```ts
import { fileAddress } from "arknights-assets-catalog"

fileAddress("audio:bgm/m_bat_autochess_loop", { name: null, format: "mp3" })
// "audio/bgm/m_bat_autochess_loop.mp3"
fileAddress("spine:enemy/enemy_1007_slime", { name: "enemy_1007_slime.atlas", format: "atlas" })
// "spine/enemy/enemy_1007_slime/enemy_1007_slime.atlas"
```

图集页与图集在同一目录，图集里的相对页名直接可用。音频没有特殊路由，地址就是 `audio/<path>.mp3`。

`fileUrl` 把文件解析成绝对地址：

```ts
fileUrl({ manifestUrl, fileRoot: manifest.fileRoot, key, file })
```

1. `fileRoot` 相对清单地址解析，`manifestUrl` 必须是绝对地址。
2. 文件有 `href` 时用 `href`（绝对地址或相对 `fileRoot`），否则用 `fileAddress`。
3. `hash` 非空时加 `?v=<hash 前 12 位>`（`VERSION_PARAM`、`VERSION_HASH_LENGTH`）。

## 发布布局

```text
/res/files/<address>                                   资源文件
/res/packs/base/<version>/manifest.json
/res/packs/season/<seasonId>/<contentHash>/manifest.json
/res/packs/mod/<modId>/<version>/manifest.json
/res/local/manifest.json                               本地覆盖清单
```

| 导出 | 值或作用 |
| --- | --- |
| `RESOURCE_ROOT` | `/res/` |
| `FILES_DIRECTORY`、`PACKS_DIRECTORY`、`LOCAL_DIRECTORY` | `files/`、`packs/`、`local/`，都在 `RESOURCE_ROOT` 下 |
| `packDirectory(pack)` | 包在 `RESOURCE_ROOT` 下的目录 |
| `packManifestAddress(pack)` | 包清单在 `RESOURCE_ROOT` 下的地址 |
| `packFileRoot(pack)` | 从包目录指向共享 `files/` 的 `fileRoot`：基础与模组包是 `../../../files/`，赛季包是 `../../../../files/`，本地清单是 `../files/` |

`emptyLocalManifest()` 返回没有条目的本地覆盖清单（`type: "local"`、`id: "local"`、`version: "0"`，`fileRoot` 为 `../files/`）。本地清单缺失时用它代替，覆盖层的层数因此不变。

upstream 覆盖清单由客户端在运行时生成，不在发布布局里；它的文件都带 `href`。id、版本与内容哈希必须能作单个路径段，否则抛 `AssetAddressError`。

因为 `fileRoot` 相对清单地址解析，`/res/` 可以整体放到另一个域名。

静态文件的 gzip、ETag、Range 与缓存策略位于 `deployment/client/config/static-policy.ts`。
