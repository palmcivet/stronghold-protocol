---
title: 目录
description: 基础媒体的 schema、发布索引和运行时基础设施。
---

# 目录

资源目录放基础媒体的 schema、catalog release，以及按 `AssetRef` 取字节的运行时基础设施。它不放赛季 packet，也不放应用的领域资源选择，构建期的下载与转换在 [资源提取](../assets-extractor/index.md) 中。

```text
assets-catalog/
  schema/                 catalog 条目与资源引用的类型
  runtime/
    media/                资源解析、媒体路由、Spine 缓存、音频缓冲
  input/                  本地骨架元数据
  product/
    media/                图片、音频、Spine、模型
    font/                 字体
    catalog.json          本次实际文件的 catalog release
```

`schema/` 与 `runtime/` 是运行时读取 catalog 和取基础字节时用的。包的入口 `.` 导出 `AssetRef`、catalog resolver、媒体路由、Spine cache 和音频 buffer。

## 输入与产物

| 路径 | 内容 |
| --- | --- |
| `assets-catalog/input/spine/` | 只有本地客户端才有的敌人骨架元数据 |
| `assets-catalog/product/media/` | 图片、音频、Spine、模型 |
| `assets-catalog/product/font/` | 字体 |
| `assets-catalog/product/catalog.json` | `CatalogRelease`，包含文件内容 id、地址、hash、依赖和来源 |

`.gitignore` 排除 `product/`。下载缓存在 `assets-extractor/.cache/`，由提取命令写入。
