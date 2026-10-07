---
title: 目录
description: 卫戍协议这一季的数据放在 app/data，编译和读取在一起。
---

# 目录

卫戍协议的资源构建器依赖资源目录，资源目录不依赖卫戍协议。

构建器复用以下逻辑：文件和 HTTP 端口、上游缓存、按清单下载、骨架和字体的准备、运行时按地址取字节。

构建器自行处理这些逻辑：读官方活动表，把干员收成这一季的棋子，把敌人收成这一季的敌人记录，写出羁绊、波次、地图和难度，并准备棋盘、表情、赛季标志。它决定要哪些官方 id，再交给目录去拉字节。

赛季数据在 `app/data`。产物在 `app/data/product/season/<id>/`。

```text
app/data/
  compiler/
    packet/               官方表收成这一季的 JSON
      compile/            season、context、validate
      text/               parse、notes
      record/             棋子、羁绊、波次等；stage/ 是 record、ground-path
      character.ts        干员属性、技能、模组。棋子、召唤物和地图共用
    media/                棋盘、表情、赛季标志，以及这一季的文件清单
      board/              atlas、surface
      emote.ts            对局表情
      fetch/              assets、plan、manifest、audio-bank、emote-catalog
    input/                tuning 与研究表
    scripts/
  runtime/
    media/                按清单解释地址
    packet/               读取赛季 JSON
  schema/                 赛季文件名
  test/                   同时用到多个源文件的用例，文件名用 .spec.ts
app/data/product/season/<id>/  这一季的 JSON
```

## 输入与产物

| 路径 | 内容 |
| --- | --- |
| `app/data/compiler/input/season/<id>/tuning.json` | 这一季手写的结算等配置 |
| `app/data/compiler/input/research/` | 模式要读的研究表 |
| `app/data/product/season/<id>/` | 这一季的 JSON 数据包 |

赛季目录里的文件名在 `schema/packet-file.ts` 的 `PACKET_FILES`，例如 `chess.json`、`enemies.json`、`waves.json`、`config.json`、`tuning.json`。它们描述卫戍协议这一季的用法。`packetAddress` 把赛季 id 和文件名收成 `/data/seasons/<id>/<file>`，`runtime/packet` 按这个地址读取。磁盘目录是 `app/data/product/season/<id>/`。立绘和骨架按官方 id 向资源目录取字节，站点上的地址是 `/assets/` 与 `/fonts/`。
