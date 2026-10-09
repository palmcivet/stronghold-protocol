---
title: 目录
description: 卫戍协议这一季的数据放在 app/data，编译和读取在一起。
---

# 目录

卫戍协议的数据构建器依赖资源目录，资源目录不依赖卫戍协议。

构建器调用资源提取的 `extract` 命令，并复用它的文件端口与缓存布局；键、清单类型、守卫与地址来自资源目录。运行时（`runtime/`）只读数据包，不引用资源提取。

构建器自行处理这些逻辑：读官方活动表，把干员收成这一季的棋子，把敌人收成这一季的敌人记录，写出羁绊、波次、地图和难度；推导基础与赛季的资源需求，派生动画角色表与棋盘 tiles，写出两份资源清单。它决定要哪些资源键，再交给提取器去取字节。整条资源流水线见 [资源从哪里来](../resource/index.md)。

赛季数据在 `app/data`。产物在 `app/data/product/season/<id>/`。

```text
app/data/
  compiler/
    gamedata.ts           提取缓存中 gamedata 表的路径与读取（@alliance/data/gamedata）
    packet/               官方表收成这一季的 JSON
      compile/            season、context、validate；levels 为关卡来源，数据包与需求共用
      text/               parse、notes
      record/             棋子、羁绊、波次等；stage/ 是 record、ground-path
      character.ts        干员属性、技能、模组。棋子、召唤物和地图共用
    media/                资源需求、派生与打包，以及对局表情
      emote.ts            对局表情
      need/               基础与赛季需求推导、--full 全量基础需求、上游缺失表、音频银行、敌人 id 收集
      derive/             动画角色表；board/ 为棋盘 tiles（atlas、material、surface、png）
      pack/               清单构建、回退、refs、fonts.css
      spine/              anim-role，把 Spine 动画名收成角色表
    input/                base/ 的版本与上游缺失表 absent.json，season/<id>/ 的版本与 tuning，research/ 研究表
    scripts/              needs、extract、packet、derive、packs、emotes 命令
  workspace.ts            目录路径，供 Vite 配置导入（@alliance/data/workspace），不依赖构建器
  runtime/
    packet/               读取赛季 JSON
    port/                 运行时的文件端口与读取错误
  schema/                 赛季文件名；资源包 refs 的类型与守卫（@alliance/data/refs）
  test/                   同时用到多个源文件的用例，文件名用 .spec.ts
  .cache/                 needs/、assets/（提取缓存）、derived/、build-data-report.json
  product/
    base/                 基础资源清单 manifest.json 与 fonts.css
    season/<id>/          这一季的数据包与赛季资源清单 manifest.json
```

## 输入与产物

| 路径 | 内容 |
| --- | --- |
| `app/data/compiler/input/season/<id>/tuning.json` | 这一季手写的结算等配置 |
| `app/data/compiler/input/research/` | 模式要读的研究表 |
| `app/data/compiler/input/base/absent.json` | 没有上游来源的键及原因，需求中写成可选 |
| `app/data/product/season/<id>/` | 这一季的 JSON 数据包 |
| `app/data/product/base/manifest.json` | 基础资源包清单，键到文件，以及领域 id 到键的 `refs` |
| `app/data/product/base/fonts.css` | 基础包的字体声明 |
| `app/data/product/season/<id>/manifest.json` | 赛季资源包清单，含动画角色表 |

赛季目录里的 packet 文件名在 `schema/packet-file.ts` 的 `PACKET_FILES`，例如 `chess.json`、`enemies.json`、`waves.json`、`config.json`、`tuning.json`。它们描述卫戍协议这一季的用法。`packetAddress` 把赛季 id 和文件名收成 `/data/seasons/<id>/<file>`，`runtime/packet` 按这个地址读取。

资源清单只含键与文件信息，不含上游地址。服务端演算只读取 packet，不读取资源清单。
