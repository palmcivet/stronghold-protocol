---
title: 编译
description: 资源目录按调用方给出的文件清单准备媒体，并生成可发布的 catalog release。
---

# 编译

资源目录只负责“怎么把文件准备好”，不关注“什么模式需要这个文件”。调用方生成 jobs 和 Spine model plans，本包负责下载、校验、后处理、缓存和发布索引。

先编译本包的 TypeScript，再跑会读 `dist/` 的命令：

```bash
cd assets-catalog
pnpm build
```

脚本根据自己的文件位置向上找到名为 `arknights-assets-catalog` 的 `package.json`，再定位 `input/` 和 `product/`。

## 命令

| 脚本 | 作用 |
| --- | --- |
| `pnpm fetch:media --jobs <file>` | 按一份 jobs/model plans 清单下载字体、音频、图片和 Spine，写到 `product/media` 与 `product/font` |
| `pnpm extract:local` | 从本机客户端提取资源，写入 `product/media` 的普通路径 |

`fetch:media` 的 `--jobs` 文件不是领域资源 manifest，而是编译器内部的物理下载计划：

- 每项包含相对路径、候选 URL、文件类型和可选字节数；
- Spine model plan 还包含 skeleton、atlas、页图、预乘 alpha 和技能动画下标。下载、重试和镜像在这个包里。

官方音频和模型索引缓存在包内的 `.cache/`。`--offline` 不联网，只对磁盘上的文件执行字体、atlas 和 Spine 后处理。当前 `extract:local` 的 package script 与提取器尚未在 next 中闭合，不能把它当作可用的本地提取命令。

下载完成后，应用构建器调用 `buildCatalogRelease()`，扫描实际被资源清单引用的媒体和字体，写出 `product/catalog.json`。每个 entry 包含内容 hash、kind、发布地址、字节数和依赖；Spine entry 会依赖同目录的 atlas 与页图。
