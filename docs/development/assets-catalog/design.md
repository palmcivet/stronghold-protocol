---
title: 设计
description: 基础字节和模式记录为什么分成两层，以及一个模式如何复用这份目录。
---

# 设计

这一页说明基础媒体、应用资源清单和发布包为什么分开。目录结构见 [目录](./layout.md)。

## 两层

## 三层边界

### 基础 catalog

catalog 是物理文件的集合：立绘、骨架、语音、技能图标等。它记录内容 id、地址、hash、依赖和来源，但不记录某个模式是否会用到某个干员。

`buildCatalogRelease()` 根据实际存在的文件生成 `catalog.json`。同一文件只要内容相同，就能在不同模式或不同赛季中复用同一个 id。

### 应用资源清单

`app/data` 的构建器根据研究表和赛季数据选择资源，把领域记录中的地址转换成 `AssetRef`，写出这一季的 `resources.json`。这一步才知道 `charId`、`enemyKey`、技能、BGM 和 UI 分组。

`assets.json` 是应用侧的兼容和诊断清单，`resources.json` 是客户端资源 store 的入口。业务代码不应把 `/assets/...` 字符串写进跨包协议；应传递资源引用或由应用 resolver 按领域记录取引用。

### 发布包

`deployment/` 中的脚本会提取应用资源，打包成资源包，原子化发布，可自由组合。

- 基础包
- 赛季包

## 运行时怎么接到字节

`app/client/resource/store.ts` 读取 base manifest、season manifest、`resources.json` 和 catalog release，构造 `ResourceResolver`。调用方拿到 `AssetRef` 后交给资源端口；resolver 负责 fallback、依赖和 `assetOrigin` 到 URL 的组合。

`assets-catalog` 不读取赛季 JSON，也不决定单位如何显示。画面、音频和 UI 只接收资源句柄；服务端演算读取 packet 中已经编译好的规则字段，不在运行时读取媒体 catalog。

## 来源与回退


`fallbackId` 是 catalog 层的物理资源回退；领域层的回退（例如敌人 alias、技能空图、token 使用 owner 头像）仍由 `app/data` resolver 决定。两者不能混为同一套规则。
