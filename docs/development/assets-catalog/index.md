---
title: 资源目录
description: arknights-assets-catalog 准备可发布的基础媒体目录，并提供资源句柄、缓存和静态传输基础设施。
---

# 资源目录

`arknights-assets-catalog` 负责基础媒体的字节和发布索引。它不关注游戏的模式或战斗规则；调用方决定要哪些文件，再由本包下载、校验、处理并生成 catalog release。

包可以单独成仓库。编译脚本可从 `/compile` 复用下载、缓存、Spine 和字体处理；浏览器或应用客户端从 `/` 根入口复用资源解析、音频和缓存基础设施。

## 基础资源

一条 catalog entry 是一个物理资源文件：字体、音频、图片、Spine 或模型。entry 的 `id` 是文件内容 hash 的短值；`address` 是发布站点上的地址。游戏里的 `charId`、`enemyId` 等语义 id 不属于本包的长期公共 schema，由 `app/data` 的赛季资源清单映射到 `AssetRef`。

## 一条目录项

一条 `CatalogEntry` 描述标识、种类、地址、完整 hash、依赖等信息。`AssetRef` 是跨包传递的轻量引用；运行时通过 catalog release 将它解析为 entry，再生成 URL。

## 阅读顺序

1. [目录](./layout.md) — 包里每一层做什么。
2. [运行时](./runtime.md) — 按地址取字节。
3. [编译](./compiler.md) — 按一份 id 清单把字节准备好。
4. [设计](./design.md) — 基础字节和模式记录为什么分成两层。
