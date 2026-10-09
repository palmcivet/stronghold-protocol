---
title: 运行时
description: 按资源引用解析基础资源，并提供媒体路由、Spine、音频和静态策略。
---

# 运行时

安装并构建之后，从包名导入运行时：解析 `AssetRef`、展开依赖、生成 URL、缓存 Spine、解码音频。

```ts
import {
  createResourceResolver,
  createSpineCache,
  createAudioBuffer,
} from "arknights-assets-catalog"
```

先在 `assets-catalog/` 里执行 `pnpm build`，TypeScript 会把声明和 JavaScript 写到 `dist/`。

调用方传入的是 catalog release 和 `AssetRef`。应用层可以把领域资源清单中的 `resources.ui.icon` 或 `resources.chars.<id>` 交给客户端资源 store，再由 resolver 取出物理地址。`assets-catalog` 不解析赛季规则。

## 字节放在哪

磁盘上的基础字节是 `product/media/` 和 `product/font/`，发布索引是 `product/catalog.json`。deployment base package 将它们分别放到 `assets/`、`fonts/` 和 `assets/catalog.json`。entry 的 address 是站点相对地址；客户端可以用 `assetOrigin` 组合为绝对 URL。

## 媒体

`mediaUrl` 把本站的音频路径收成无扩展名形式，例如 `/assets/audio/bgm/act1.mp3` 变成 `/media/bgm/act1`。已经是绝对地址的 URL 保持不变。站点再按候选扩展名找文件。它只处理媒体路由，不负责根据干员或敌人 id 找资源。

`createSpineCache` 按引用计数持有骨架。空闲字节超过预算才卸载；卸载还没完成时，不会把句柄交出去。加载器由调用方传入。

`createAudioBuffer` 先走无扩展名路径，再解码成可播放的缓冲。

`createResourceResolver(release)` 提供四个操作：

| 操作 | 作用 |
| --- | --- |
| `ref(address)` | 从 catalog address 找到 `AssetRef` |
| `resolve(ref)` | 解析 entry；找不到时沿 `fallbackId` 回退 |
| `dependencies(ref)` | 返回 entry 及其物理依赖，例如 Spine 的 atlas 和页图 |
| `url(ref, origin)` | 将 entry address 组合成相对或绝对 URL |

`app/client/resource/store.ts` 负责加载 base manifest、season manifest、`resources.json` 和 catalog release。资源加载失败时只对临时错误重试。

## 静态文件

静态文件策略位于 `deployment/client/config/static-policy.ts`，约定 gzip、ETag、单区间 Range，以及页面短缓存、素材一天缓存和带 `v=` 地址的一年 immutable 缓存。它是策略库，不是 HTTP server；deployment 或站点服务器负责执行这些策略。
