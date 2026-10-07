---
title: 目录
description: 卫戍协议这一季的数据放在 app/data，编译和读取在一起。
---

# 目录

卫戍协议的数据构建器依赖资源目录，资源目录不依赖卫戍协议。

构建器从资源目录复用下载、上游缓存、格式校验、Spine 和字体处理，以及 catalog release 的生成。它不把资源目录的 compiler 细节暴露给运行时。

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
    media/                按领域清单解释资源
    packet/               读取赛季 JSON
  schema/                 赛季文件名
  test/                   同时用到多个源文件的用例，文件名用 .spec.ts
app/data/product/season/<id>/  这一季的 packet、assets.json 和 resources.json
```

## 输入与产物

| 路径 | 内容 |
| --- | --- |
| `app/data/compiler/input/season/<id>/tuning.json` | 这一季手写的结算等配置 |
| `app/data/compiler/input/research/` | 模式要读的研究表 |
| `app/data/product/season/<id>/` | 这一季的 JSON 数据包 |
| `app/data/product/season/<id>/assets.json` | 面向兼容和诊断的应用媒体清单，保留领域 id 到站点地址的结构 |
| `app/data/product/season/<id>/resources.json` | 面向客户端资源 store 的领域资源清单，地址已转换成 `AssetRef` |
| `assets-catalog/product/catalog.json` | 物理文件的 catalog release，由 `compile:assets` 同步生成 |

赛季目录里的 packet 文件名在 `schema/packet-file.ts` 的 `PACKET_FILES`，例如 `chess.json`、`enemies.json`、`waves.json`、`config.json`、`tuning.json`。它们描述卫戍协议这一季的用法。`packetAddress` 把赛季 id 和文件名收成 `/data/seasons/<id>/<file>`，`runtime/packet` 按这个地址读取。

`assets.json` 是给开发检查和兼容使用的地址型清单；`resources.json` 是客户端真正使用的资源句柄清单。服务端演算只读取 packet，不在启动时读取媒体文件或资源 catalog。
