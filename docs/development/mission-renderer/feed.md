---
title: 本地喂数
description: local 模式下，调用方每帧推入快照与事件，舞台用渲染时钟插值单位，并按 tick 释放事件。
---

# 本地喂数

`local` 模式给逐帧模拟用。调用方每个真实帧推入一份快照和若干事件，舞台不直接显示它们，而是用一条渲染时钟慢半拍地播放。这样画面上的单位在两帧之间平滑移动，事件也按它们发生的 tick 出现。

```ts
stage.dispatch({ type: "set-update-mode", mode: "local", speed: 1, delay: 0.1 })

// 每个真实帧
stage.dispatch({ type: "push-snapshot", snapshot })
for (const event of events) stage.dispatch({ type: "push-event", event })
stage.update(deltaSeconds)
```

`speed` 和 `delay` 都可省略，省略时取下面的默认值。

## 参数

`createLocalFeed` 直接使用时，参数是 `LocalFeedOptions`。舞台只传入 `speed` 和 `delay`。

| 参数 | 缺省 | 范围 | 含义 |
| --- | --- | --- | --- |
| `speed` | 2 | 0.05 到 20 | 每真实秒推进的游戏秒数，即战斗速度 |
| `delay` | 0.034 | 不小于 0 | 渲染时钟落后最新帧的真实秒数 |
| `keep` | 2.5 | 不小于 0.5 | 渲染时钟后面保留的真实秒数帧 |

## 渲染时钟

游戏时间由 tick 换算：`tick × TICK`，`TICK` 为 1/30 秒。

- 第一帧到达时，渲染时钟设为 `最新帧时间 − delay × speed`。
- `advance(deltaSeconds)` 每次先把 `deltaSeconds` 限制在 0 到 0.25 秒之间，然后推进 `dt × speed`。
- 推进后，时钟与目标位置（`最新帧时间 − delay × speed`）的偏差大于 `0.75 × speed` 时直接对齐到目标。否则按偏差的一部分逐步修正，修正比例为 `min(1, dt × 3)`。
- 时钟始终限制在缓冲的第一帧与最后一帧之间。

同一时间的快照会替换原有的一帧。新快照的 tick 小于最新一帧时，视为模拟重启：清空帧、事件和时钟。

## 插值

`sample()` 取渲染时钟两侧的两帧 `a`（较早）和 `b`（较晚），按 `alpha = (时钟 − a) / (b − a)` 插值。

- 两帧都有的单位，位置线性插值。位置有变化的单位进入 `moving`。
- 只在 `b` 中出现的单位，原样返回。
- 只在 `a` 中出现的单位，在 `alpha < 1` 时仍保留，用 `a` 的状态。这让刚离场的单位不会在一帧内消失。

返回值中的 `snapshot` 是 `b`，标记（`flags`）和属性（`attributes`）都取自它。

舞台只把 `sample().units` 写入 `view.units`。`moving` 集合目前不被舞台使用。

## 事件

`pushEvent` 把事件放入队列，队列最多 2000 条，超出时丢弃最早的。`takeEvents()` 取出 tick 对应时间不晚于渲染时钟的事件，其余留在队列中。

没有帧时渲染时钟为 NaN，事件留在队列中，不释放。

## 重置

`reset()` 清空帧、事件和渲染时钟。舞台在 `reset` 命令和 `set-update-mode` 切换时会丢弃 feed 实例，因此这两个操作都会清空缓冲。
