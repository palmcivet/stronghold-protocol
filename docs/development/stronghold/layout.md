---
title: 目录
description: 卫戍协议这一季的数据放在 app/data，编译和读取在一起。
---

# 目录

赛季数据在 `app/data`。产物在 `app/product/season/<id>/`。

```text
app/data/
  compiler/
    packet/               官方表收成这一季的 JSON
      compile/            season、context、validate
      text/               parse、notes
      record/             棋子、羁绊、波次等；stage/ 是 record、ground-path
    media/                棋盘、表情、赛季标志，以及这一季的文件清单
      board/              atlas、surface
      emote.ts            对局表情
      fetch/              assets、plan、manifest、audio-bank、emote-catalog
    input/                tuning 与研究表
    scripts/
  runtime/                读取赛季 JSON，按清单解释地址
  schema/                 赛季文件名
app/product/season/<id>/  这一季的 JSON
```

## 输入与产物

| 路径 | 内容 |
| --- | --- |
| `app/data/compiler/input/season/<id>/tuning.json` | 这一季手写的结算等配置 |
| `app/data/compiler/input/research/` | 模式要读的研究表 |
| `app/product/season/<id>/` | 这一季的 JSON 数据包 |

赛季目录里的文件名是 `chess.json`、`bonds.json`、`enemies.json` 这些。它们描述卫戍协议这一季的用法。立绘和骨架按官方 id 向资源目录取字节。
