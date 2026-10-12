---
title: 实现原理
description: 覆盖层的查找表与懒计算地址、回退链检查、refs 合并、Spine 缓存的引用计数与淘汰，以及源码结构。
---

# 实现原理

这一页写给读源码或排查问题的人，说明几个关键机制怎样实现。行为约定以各指南页为准。

## 覆盖层查找

- `createAssetResolver` 先逐层运行包清单守卫，再从低到高遍历每层的 `assets`，把键写进一张 `Map`。后写的层覆盖先写的层，所以查找是一次 `Map` 读取
- 条目的绝对地址在第一次 `entry(key)` 时才计算，结果缓存在另一张 `Map` 里
- `refs` 在建立解析器时合并一次，之后的 `ref` 只是按路径读取

## 回退链

`chain(key)` 从请求的键出发，沿 `fallbackId` 逐个取条目：

- 用一个已访问列表检测环；遇到访问过的键就抛 `fallback-cycle`，消息里是整条路径
- 每取到一个条目，与链首比较种类，不同就抛 `fallback-kind`
- 取不到条目时结束，链上只留下取到的条目
- 结果按键缓存；`resolve` 只是在链上找第一个不在 `failed` 里的条目

`dependencies(key)` 先解析根，再深度优先展开 `dependsOn`，用实际命中的键去重，所以依赖之间互相引用也不会死循环。

## refs 合并

`mergeRefs` 按层从低到高合并同名字段：

- 两边都是对象时递归合并
- 否则高层的值整体替换，键和数组都不逐项合并

`refNodeAt` 按路径逐级读取：遇到数组时把名字当下标，遇到对象时只读自有字段。`refKeyAt` 在读到的节点是合法键时返回它，否则返回 `null`。

## Spine 缓存

Spine 缓存建立在一个通用的引用计数缓存之上，每个键一条记录：

- **引用计数**：`acquire` 加一，`release` 减一，不会低于零。计数大于零的记录不会被淘汰
- **并发去重**：同一个键的第一次 `acquire` 建立记录并开始加载，之后的调用拿到同一个 promise
- **并发上限**：加载排队执行，同时最多 `concurrency` 个
- **超时与重开**：每次尝试有 `timeout`；`restart` 作废当前尝试并开新的一次，先成功的那次生效，失败只认最新一次
- **失败记录**：失败后记录保留 `failTtl`，期间的 `acquire` 共用这次失败
- **淘汰**：释放后延迟 `evictDelay` 集中整理。先按条数丢最久没用的空闲记录，再按估算字节丢过了宽限期的空闲记录
- **安静预算**：没有引用、也没有 `hold` 的时间超过 `quietDelay` 后，字节预算改用 `quietBytes`
- **估算字节**：默认的 `spineDataWeight` 按骨骼、插槽、网格顶点、时间轴帧等数组的长度估算，下限 64 KB
- **卸载与共享页**：卸载某个模型时，先收集其他仍在缓存里的模型用到的图集页，作为 `keep` 交给 `unload`
- **卸载与重载**：`unload` 返回 promise 时，同一个键的下一次加载会等它结束；迟到的卸载不会拆掉同一键上更新的记录

## 音频缓存

- 缓存是一张按插入顺序排列的 `Map`，值是解码的 promise
- 命中时把这一项移到末尾，所以淘汰时最久没用的在最前面
- 解码完成后记下 PCM 字节（`length × 声道数 × 4`），超出条数或字节上限时从前往后淘汰，跳过 `retain` 返回 `true` 的项
- 失败的 promise 解析为 `null`，警告按键去重

## 源码结构

```text
assets-catalog/
  key/
    asset-key.ts        种类表，键的解析、格式化与校验
  schema/
    issue.ts            守卫的问题类型与读取工具
    asset-file.ts       文件条目与按种类的文件规则
    color-space.ts      图像的颜色空间
    needs-list.ts       需求清单
    raw-catalog.ts      原始清单
    pack-manifest.ts    包清单与 refs
    spine-meta.ts       Spine 元数据
  address/
    file.ts             键与文件到相对地址、文件的绝对地址
  resolver/
    overlay.ts          覆盖层、按键查找、回退链、依赖展开
    refs.ts             refs 合并与查找
  cache/
    spine.ts            引用计数缓存与 Spine 句柄缓存
    audio.ts            音频解码缓存
  test/                 跨多个模块的用例
  index.ts              包入口
```

只覆盖单个源文件的用例放在源文件旁边，文件名用 `.test.ts`。
