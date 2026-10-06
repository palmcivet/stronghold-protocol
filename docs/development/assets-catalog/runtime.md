---
title: 运行时
description: 从 arknights-assets-catalog 按地址读取基础资源的字节和缓存。
---

# 运行时

安装并构建之后，从包名导入运行时：按地址取字节、缓存骨架、解码音频。

```ts
import {
  mediaUrl,
  createSpineCache,
  createAudioBuffer,
} from "arknights-assets-catalog"
```

先在 `assets-catalog/` 里执行 `pnpm build`，TypeScript 会把声明和 JavaScript 写到 `dist/`。

调用方传入的是地址。一个模式可以先从自己的清单查出某个官方 id 对应的立绘或骨架地址，再交给这里的缓存。

## 字节放在哪

磁盘上的基础字节是 `product/media/` 和 `product/font/`。站点上的地址是 `/assets/` 和 `/fonts/`。部署把这两份目录挂上去。

## 媒体

`mediaUrl` 把本站的音频路径收成无扩展名形式，例如 `/assets/audio/bgm/act1.mp3` 变成 `/media/bgm/act1`。已经是绝对地址的 URL 保持不变。站点再按候选扩展名找文件。

`createSpineCache` 按引用计数持有骨架。空闲字节超过预算才卸载；卸载还没完成时，不会把句柄交出去。加载器由调用方传入。

`createAudioBuffer` 先走无扩展名路径，再解码成可播放的缓冲。

## 静态文件

`runtime/service/static-policy.ts` 约定 gzip、ETag、单区间 Range，以及页面短缓存、素材长缓存。站点按这些约定提供字节。
