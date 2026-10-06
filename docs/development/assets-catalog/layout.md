---
title: 目录
description: assets-catalog 放基础字节，以及按地址取这些字节的运行时。
---

# 目录

资源目录放基础字节，以及按地址取这些字节的运行时。

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
    extraction/           从本地客户端提取公开源没有的模型
    scripts/              命令行入口
  input/                  本地骨架元数据
  product/
    media/                图片、音频、Spine
    font/                 字体
  test/
```

同一目录里的文件职责相同。文件名写这一块的职责，目录里只有一个文件时，把文件放在上一级。

## 运行时与编译器

`schema/`、`port/`、`runtime/` 是取基础字节的时候用的。

`compiler/` 在准备这些字节时运行。包的运行时入口 `.` 导出按地址取字节。子路径 `./compile` 导出下载、上游缓存、骨架和字体准备，给模式构建器调用。

## 输入与产物

| 路径 | 内容 |
| --- | --- |
| `assets-catalog/input/spine/` | 只有本地客户端才有的敌人骨架元数据 |
| `assets-catalog/product/media/` | 图片、音频、Spine |
| `assets-catalog/product/font/` | 字体 |

`.gitignore` 排除 `product/` 和 `.cache/`。重新运行对应的构建可以再生成。
