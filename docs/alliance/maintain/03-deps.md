---
title: 包依赖
description: alliance 各包与四个库、第三方库的依赖方向，以及库不依赖应用等边界。
---

# 包依赖

包职责与对局数据流见 [架构](./02-architecture.md)。这里展开依赖图，供改包边界或排查「谁能引用谁」时用。

箭头表示「依赖」方向。库名省略前缀 `arknights-`。

```mermaid
flowchart BT
  contract["@alliance/contract"]
  catalog[assets-catalog]
  extractor[assets-extractor]
  core[mission-core]
  renderer[mission-renderer]
  valibot[valibot]
  ws[ws]

  data["@alliance/data"] --> catalog
  data --> extractor
  data --> core

  compat["@alliance/compat-upstream"] --> catalog
  compat --> valibot

  server["@alliance/server"] --> contract
  server --> data
  server --> core
  server --> ws

  ui["@alliance/ui"]

  client["@alliance/client"] --> contract
  client --> data
  client --> catalog
  client --> compat
  client --> core
  client --> renderer
  client --> ui
```

- 库不依赖应用。`assets-extractor` 只被 `@alliance/data` 的构建脚本使用，不进入客户端与服务端的产物
- 客户端与 `@alliance/ui` 的文档站另依赖 OFL 字体包 `@fontsource-variable/noto-sans-sc`、`@fontsource-variable/noto-serif-sc`、`@fontsource/rajdhani`、`@fontsource-variable/saira`。它们只给这两个包用，不进 catalog。Bender 与 Novecento Wide 由资源包的 `fonts.css` 提供
- `@alliance/ui` 是库，不依赖客户端或其他应用；客户端只从它的包入口导入
- 服务端只读赛季数据包，不读资源清单与媒体文件
- 明日方舟的语义（干员、敌人、语音槽位、赛季）只在 `@alliance/data`，两个资源库只认识键

资源流水线里各包的分工见 [资源从哪里来](./data/03-resource.md#包之间的关系)。连接 master 后端时的图层与映射见 [连接 master 后端](./compat/index.md)。编译器目录见 [数据编译器与目录](./data/04-directory.md)；客户端分层见 [客户端目录与分层](./client/17-directory.md)。
