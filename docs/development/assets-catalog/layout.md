---
title: 目录
description: 基础媒体的 schema、编译器、发布索引和运行时基础设施。
---

# 目录

资源目录放基础媒体的 schema、下载与后处理工具、catalog release，以及按 `AssetRef` 取字节的运行时基础设施。它不放赛季 packet，也不放应用的领域资源选择。

```text
assets-catalog/
  schema/                 一条基础资源
  port/                   文件与 HTTP
  runtime/
    media/                按地址取字节、Spine 缓存、音频缓冲
    service/              静态路径与缓存约定
  compiler/
    download/             downloader、source、format、cache
    font/                 build、woff2
    spine/                model、atlas、skel、anim-role
    scripts/              命令行入口
  input/                  本地骨架元数据
  product/
    media/                图片、音频、Spine
    font/                 字体
    catalog.json          本次实际文件的 catalog release
  test/                   同时用到多个源文件的用例，文件名用 .spec.ts
```

## 运行时与编译器

`schema/`、`port/`、`runtime/` 是读取 catalog 和取基础字节时用的。

`compiler/` 在准备这些字节时运行。包的运行时入口 `.` 导出 `AssetRef`、catalog resolver、媒体路由、Spine cache、音频 buffer 和静态策略。子路径 `./compile` 导出下载、上游缓存、骨架、字体和 release index，给应用构建器调用。

## 输入与产物

| 路径 | 内容 |
| --- | --- |
| `assets-catalog/input/spine/` | 只有本地客户端才有的敌人骨架元数据 |
| `assets-catalog/product/media/` | 图片、音频、Spine |
| `assets-catalog/product/font/` | 字体 |
| `assets-catalog/product/catalog.json` | `CatalogRelease`，包含文件内容 id、地址、hash、依赖和来源 |

`.gitignore` 排除 `product/` 和 `.cache/`；重新运行对应的应用资源编译可以生成媒体、字体和 catalog release。
