---
title: 资源目录
description: arknights-assets-catalog 按官方 id 准备基础资源，并做成可加载、可缓存、可释放的句柄。
---

# 资源目录

`arknights-assets-catalog` 准备《明日方舟》的基础资源。它按官方 id 拉取干员、敌人、技能和代币的形象与声音，以及字体，再把一个稳定的标识变成可以加载、缓存和释放的句柄。

语言是 TypeScript，运行时是 Node.js 20。包可以单独成仓库。游戏进程和浏览器使用运行时入口。模式构建器从 `arknights-assets-catalog/compile` 复用下载、缓存、骨架和字体。拉取字节的命令在本包。

## 基础资源

一条资源是字节：字体、音频、头像、贴图、Spine、模型。标识用官方 id，例如干员的 `charId`、敌人的 `enemyId`。

## 一条目录项

一条 `CatalogEntry` 描述标识、种类、地址、体积、哈希、依赖、回退和预加载分组。运行时按这条记录去取字节。

## 阅读顺序

1. [目录](./layout.md) — 包里每一层做什么。
2. [运行时](./runtime.md) — 按地址取字节。
3. [编译](./compiler.md) — 按一份 id 清单把字节准备好。
4. [设计](./design.md) — 基础字节和模式记录为什么分成两层。
