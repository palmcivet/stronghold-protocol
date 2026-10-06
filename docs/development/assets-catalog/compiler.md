---
title: 编译
description: 资源目录按调用方给出的文件清单准备基础字节。
---

# 编译

资源目录准备字节。

先编译本包的 TypeScript，再跑会读 `dist/` 的命令：

```bash
cd assets-catalog
pnpm build
```

脚本根据自己的文件位置向上找到名为 `arknights-assets-catalog` 的 `package.json`，再定位 `input/` 和 `product/`。

## 命令

| 脚本 | 作用 |
| --- | --- |
| `pnpm fetch:media --jobs <file>` | 按一份文件清单下载字体、音频、图片和 Spine，写到 `product/media` 与 `product/font` |
| `pnpm extract:local` | 用 Python 从本地客户端提取公开源没有的基础模型 |

清单由调用方给出：要哪些官方 id 的文件。`fetch:media` 读那份清单，把字节写到 `product/media` 与 `product/font`。下载、重试和镜像在这个包里。官方音频和模型索引缓存在包内的 `.cache/`。`--offline` 使用已经缓存的文件。

`extract:local` 需要本机安装的《明日方舟》客户端，以及 `compiler/extraction/requirements.txt` 里的 Python 依赖。`extract.py` 从本地客户端提取公开源没有的模型，字节写进 `product/media`。任务表还可以列入某个模式要的图片，和模型写在同一份程序里。
