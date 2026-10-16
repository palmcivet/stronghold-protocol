---
title: "赛季包"
description: 卫戍协议的赛季包、资源清单和构建器。
---

# @alliance/data

把官方的数据收成这一季的记录：干员收成棋子，敌人收成这一季的属性、波次和难度。资源部分由本应用决定哪些键进入基础包与赛季包；取文件由 [arknights-assets-extractor](../../../assets-extractor/index.md) 负责，清单格式由 [arknights-assets-catalog](../../../assets-catalog/index.md) 定义。

`app` 是构建目标。编译和读取在同一目录。

- [目录](./01-layout.md)：产物路径、`PACKET_FILES` / `packetAddress` 与运行时读取面
- [编译](./02-compiler.md)：构建命令与流程
- [资源从哪里来](./03-resource.md)：键、提取、派生与发布布局
- [数据编译器与目录](./04-directory.md)：编译器目录树、手写输入与本地开发服务器
