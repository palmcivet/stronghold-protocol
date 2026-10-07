---
title: 编译
description: 卫戍协议的构建器写出这一季的 packet、资源清单，并调用资源目录生成媒体发布索引。
---

# 编译

先在 `app/data/` 里执行 `pnpm build`，再跑会读 `dist/` 的命令。脚本根据自己的文件位置向上找到名为 `@alliance/data` 的 `package.json`。

| 脚本 | 作用 |
| --- | --- |
| `pnpm --filter @alliance/data compile:packet --season <id>` | 把官方表编译成这一季的 JSON，并抄入 `tuning.json`，写到 `product/season/<id>/` |
| `pnpm --filter @alliance/data compile:assets --season <id>` | 按研究表列出这一季的文件，调用资源目录下载和处理字节，写出 `assets.json`、`resources.json`，并同步 `assets-catalog/product/catalog.json` |
| `pnpm --filter @alliance/data compile:emotes --season <id>` | 写出这一季的 `emotes.json` |
| `pnpm --filter @alliance/data crop:board` | 从卫戍协议棋盘图集裁出材质矩形，字节写入资源目录的 `product/media` |

`compile:packet` 读 `data/compiler/input/season/<id>/tuning.json` 和 `data/compiler/input/research/`。缺了某份研究表时，数据包用默认值并留下警告。地面路线在编译地图时算好，写进地图。官方活动表缓存在 `app/data/.cache/`。`--offline` 使用已经缓存的文件。`--refresh` 重新下载。这两个开关不能同时使用。

构建器读官方活动表，写出赛季 packet，并列出这一季要哪些资源。资源目录按物理 jobs 下载并处理字节，随后 `buildCatalogRelease()` 为实际引用的文件生成内容索引。`resources.json` 将 `assets.json` 中的站点地址转换为带 `id`、`kind`、`address` 和 `fallbackId` 的 `AssetRef`。

作战核心收 `BattleSpec` 和已经归一化的单位定义。读取棋子表的代码在 `app`。作战画面不读取 `chess.json` 或 `assets.json`，由客户端资源 store 从 `resources.json` 取得资源引用，再通过资源端口加载。休整棋盘在 `app`。

发布时赛季 JSON 由 `compile:packet` 从 [Kengxxiao/ArknightsGameData](https://github.com/Kengxxiao/ArknightsGameData) 的 `zh_CN/gamedata/` 整理，并叠上 `tuning.json` 和研究表。

精英模组可以带 `meleeOnHighGround`。为真时，这名近战棋可以站在远程位。淡金坠饰 `uniequip_003_glady` 写上这个字段。分支特性「可以放置于远程位」不决定站位。

媒体字节由 `compile:assets` 按社区项目下载；应用清单和 catalog release 属于两个不同层次：前者描述本季使用方式，后者描述实际发布的物理文件。
