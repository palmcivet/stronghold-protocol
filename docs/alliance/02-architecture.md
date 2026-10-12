---
title: 架构
description: app/ 下的各个包、它们的依赖，以及数据从构建期到对局的流向。
---

# 架构

## 包

| 目录 | 包 | 职责 |
| --- | --- | --- |
| `app/contract` | `@alliance/contract` | 客户端与服务端共用的消息与版本 |
| `app/data` | `@alliance/data` | 赛季数据包与资源包的构建器，以及读取 |
| `app/server` | `@alliance/server` | 对局进程：HTTP、WebSocket、房间与对局 |
| `app/client` | `@alliance/client` | 浏览器客户端与开发服务器 |
| `app/compat/upstream` | `@alliance/compat-upstream` | 连接 master 后端的兼容层 |

## 依赖

- `@alliance/contract`：无
- `@alliance/data`：`assets-catalog`、`assets-extractor`、`mission-core`
- `@alliance/server`：`@alliance/contract`、`@alliance/data`、`mission-core`、`ws`
- `@alliance/client`：`@alliance/contract`、`@alliance/data`、`assets-catalog`、`@alliance/compat-upstream`、`mission-core`、`mission-renderer`
- `@alliance/compat-upstream`：`assets-catalog`、`valibot`

表中的库名省略了前缀 `arknights-`。

- 库不依赖应用。`assets-extractor` 只被 `@alliance/data` 的构建脚本使用，不进入客户端与服务端的产物
- 服务端只读赛季数据包，不读资源清单与媒体文件
- 明日方舟的语义（干员、敌人、语音槽位、赛季）只在 `@alliance/data`，两个资源库只认识键

## 数据流

```text
构建期  gamedata、社区仓库 ─▶ @alliance/data ─▶ 数据包、基础包、赛季包
对局    数据包 ─▶ @alliance/server ─▶ 战斗规格 ─▶ 浏览器演算 ─▶ 结果交回服务端
画面    资源包 ─▶ assets-catalog ─▶ mission-renderer
```

- 数据与资源的流水线见 [资源从哪里来](./data/03-resource.md)
- 战斗默认在浏览器里按服务端发来的规格演算，服务端验收结果，见 [作战](./protocol/05-combat.md)
- 连接 master 后端时，资源改由 `@alliance/compat-upstream` 从后端的资源表生成，见 [连接 master 后端](./compat/index.md)
