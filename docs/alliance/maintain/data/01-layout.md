---
title: 目录
description: 卫戍协议这一季的产物路径与运行时读取面。
---

# 目录

卫戍协议的数据构建器依赖 `arknights-assets-catalog`，构建时调用 `arknights-assets-extractor`；运行时只读数据包。编译器目录与手写输入见 [数据编译器与目录](./04-directory.md)。

产物在 `alliance/data/product/`：

| 路径 | 内容 |
| --- | --- |
| `alliance/data/product/season/<id>/` | 这一季的 JSON 数据包 |
| `alliance/data/product/base/manifest.json` | 基础资源包清单，键到文件，以及领域 id 到键的 `refs` |
| `alliance/data/product/base/fonts.css` | 基础包的字体声明 |
| `alliance/data/product/season/<id>/manifest.json` | 赛季资源包清单，含动画角色表 |

赛季目录里的 packet 文件名在 `schema/packet-file.ts` 的 `PACKET_FILES`，例如 `chess.json`、`enemies.json`、`waves.json`、`config.json`、`tuning.json`。它们描述卫戍协议这一季的用法。`packetAddress` 把赛季 id 和文件名收成 `/data/seasons/<id>/<file>`，`runtime/packet` 按这个地址读取。

资源清单只含键与文件信息，不含上游地址。服务端演算只读取 packet，不读取资源清单。
