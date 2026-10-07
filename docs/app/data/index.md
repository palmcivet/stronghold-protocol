---
title: 卫戍协议数据
description: 卫戍协议的赛季包、资源清单和构建器。
---

# 卫戍协议数据

提取官方的资源，收成这一季的记录：干员收成棋子，敌人收成这一季的属性、波次和难度。构建器和读取都在 `app/data`。媒体由资源目录准备，但本应用决定哪些资源进入本季，并将地址转换成 `AssetRef` 写入 `resources.json`。

`app` 是构建目标。编译和读取在同一目录。

## 阅读顺序

1. [目录](./layout.md) — `app/data` 里每一层做什么。
2. [编译](./compiler.md) — 怎么写出这一季的 JSON、资源清单和 catalog release。
