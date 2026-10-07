---
title: 编译
description: 卫戍协议的构建器写出这一季的 JSON，并按清单向资源目录要字节。
---

# 编译

先在 `app/` 里执行 `pnpm build`，再跑会读 `dist/` 的命令。脚本根据自己的文件位置向上找到名为 `stronghold-app` 的 `package.json`。

| 脚本 | 作用 |
| --- | --- |
| `pnpm compile:packet --season <id>` | 把官方表编译成这一季的 JSON，并抄入 `tuning.json`，写到 `product/season/<id>/` |
| `pnpm compile:assets --season <id>` | 按研究表列出这一季的文件，调用资源目录的 `./compile` 下载字节，写出 `assets.json` |
| `pnpm compile:emotes --season <id>` | 写出这一季的 `emotes.json` |
| `pnpm crop:board` | 从卫戍协议棋盘图集裁出材质矩形，字节写入资源目录的 `product/media` |

`compile:packet` 读 `data/compiler/input/season/<id>/tuning.json` 和 `data/compiler/input/research/`。缺了某份研究表时，数据包用默认值并留下警告。地面路线在编译地图时算好，写进地图。官方活动表缓存在 `app/.cache/`。`--offline` 使用已经缓存的文件。`--refresh` 重新下载。这两个开关不能同时使用。

构建器读官方活动表，写出赛季 JSON，并列出这一季要哪些官方 id。资源目录按那份清单把字节准备好。

作战核心收 `BattleSpec` 和已经归一化的单位定义。读取棋子表的代码在 `app`。作战画面收快照、事件，以及这里填好的骨架地址，再向资源目录要这个地址上的字节。休整棋盘在 `app`。

发布时赛季 JSON 由 `compile:packet` 从 [Kengxxiao/ArknightsGameData](https://github.com/Kengxxiao/ArknightsGameData) 的 `zh_CN/gamedata/` 整理，并叠上 `tuning.json` 和研究表。

精英模组可以带 `meleeOnHighGround`。为真时，这名近战棋可以站在远程位。淡金坠饰 `uniequip_003_glady` 写上这个字段。分支特性「可以放置于远程位」不决定站位。

媒体字节由 `compile:assets` 按社区项目下载。
