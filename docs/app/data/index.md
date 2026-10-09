---
title: 卫戍协议数据
description: 卫戍协议的赛季包、资源清单和构建器。
---

# 卫戍协议数据

把官方的数据收成这一季的记录：干员收成棋子，敌人收成这一季的属性、波次和难度。资源部分由本应用决定哪些键进入基础包与赛季包；取文件由 [资源提取](../../development/assets-extractor/index.md) 负责，清单格式由 [资源目录](../../development/assets-catalog/index.md) 定义。

`app` 是构建目标。编译和读取在同一目录。

## 阅读顺序

1. [目录](./layout.md) — `app/data` 里每一层做什么。
2. [编译](./compiler.md) — 怎么写出这一季的 JSON 与资源清单。
3. [资源从哪里来](../resource/index.md) — 从上游仓库到客户端的整条资源流水线。
