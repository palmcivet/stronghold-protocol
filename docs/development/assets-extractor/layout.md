---
title: 目录
description: 资源提取包的目录、缓存和默认输出位置。
---

# 目录

```text
assets-extractor/
  download/               下载器、来源地址、格式校验、索引缓存
  font/                   字体构建与 WOFF2
  spine/                  图集、骨架解析与 Spine 模型处理
  catalog/                release index（catalog.json）的生成
  port/                   构建期的文件与 HTTP 端口
  script/                 fetch-media 命令
  source/
    local-client/python/  本机客户端提取脚本与依赖（Python）
  test/                   同时用到多个源文件的用例，文件名用 .spec.ts
  .cache/                 下载缓存、账本与索引（不提交）
  workspace.ts            默认输出目录
  package-root.ts         按包名向上找到本包根
  index.ts                包的导出入口
```

单个源文件的用例与源码放在一起，文件名用 `.test.ts`。

## 默认输出位置

| 内容 | 默认路径 | 覆盖方式 |
| --- | --- | --- |
| 图片、音频、Spine、模型 | `assets-catalog/product/media/` | `fetch:media --media` |
| 字体 | `assets-catalog/product/font/` | `fetch:media --font` |
| 下载缓存与账本 | `assets-extractor/.cache/` | `fetch:media --cache` |
| 本机客户端提取结果 | `assets-catalog/product/media/` | `extract:local --out` |

`assets-catalog/product/` 是运行时使用的发布目录，由 `assets-catalog` 的 `.gitignore` 排除。
