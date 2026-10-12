---
title: 本地喂数
description: local 模式下，调用方每帧推入快照与事件，舞台用渲染时钟插值单位，并按 tick 释放事件。
---

# 本地喂数

`local` 模式给逐帧模拟用。调用方每个真实帧推入一份快照和若干事件，舞台不直接显示它们，而是用一条**渲染时钟**慢半拍地播放：单位在两帧之间平滑移动，事件按它们发生的 tick 出现。

```ts
import type { BattleEvent, BattleSnapshot } from "arknights-mission-core"
import { createMissionStage } from "arknights-mission-renderer"

const stage = createMissionStage(null)
stage.dispatch({ type: "set-update-mode", mode: "local", speed: 1, delay: 0.1 })

// 每个真实帧
export function onFrame(
  snapshot: BattleSnapshot,
  events: readonly BattleEvent[],
  deltaSeconds: number,
): void {
  stage.dispatch({ type: "push-snapshot", snapshot })
  for (const event of events) {
    stage.dispatch({ type: "push-event", event })
  }
  stage.update(deltaSeconds)
}
```

## 参数

舞台只传入 `speed` 和 `delay`；直接用 `createMissionFeed` 时还可以给 `keep`。

| 参数 | 缺省 | 范围 | 含义 |
| --- | --- | --- | --- |
| `speed` | 2 | 0.05 到 20 | 每真实秒的游戏秒数 |
| `delay` | 0.034 | 不小于 0 | 落后最新帧的真实秒数 |
| `keep` | 2.5 | 不小于 0.5 | 时钟之后保留的真实秒数 |

## 渲染时钟

游戏时间由 tick 换算：`tick × TICK`，`TICK` 为 1/30 秒。

- 第一帧到达时，时钟设为 `最新帧时间 − delay × speed`
- `advance(deltaSeconds)` 先把 `deltaSeconds` 限制在 0 到 0.25 秒，再推进 `dt × speed`
- 推进后，时钟与目标（`最新帧时间 − delay × speed`）的偏差大于 `0.75 × speed` 时直接对齐；否则按 `min(1, dt × 3)` 的比例逐步修正
- 时钟始终限制在缓冲的第一帧与最后一帧之间
- 同一时间的快照替换原有的一帧
- 新快照的 tick 小于最新一帧时视为模拟重启：清空帧、事件和时钟

## 插值

`sample()` 取时钟两侧的两帧 `a`（较早）和 `b`（较晚），按 `alpha = (时钟 − a) / (b − a)` 插值：

- 两帧都有的单位，位置线性插值；位置有变化的进入 `moving`
- 只在 `b` 中的单位原样返回
- 只在 `a` 中的单位在 `alpha < 1` 时仍保留，用 `a` 的状态，刚离场的单位不会在一帧内消失
- 返回的 `snapshot` 是 `b`，标签（`tags`）和属性（`attributes`）都取自它

舞台把 `sample().units` 写入 `view.units`，`moving` 交给演员决定是否播移动动画。

## 事件

- `pushEvent` 放入队列，最多 2000 条，超出时丢弃最早的
- `takeEvents()` 取出时间不晚于时钟的事件，其余留在队列中
- 没有帧时时钟为 `NaN`，事件不释放

## 调整与重置

- `configure({ speed, delay })` 修改速度或延迟，帧与事件保留；舞台在 `set-speed` 和再次切到 `local` 时调用它
- `pendingEvents()` 返回尚未释放的事件；切回 `external` 时舞台把它们留给下一次 `update`
- `reset()` 清空帧、事件和时钟；舞台在 `reset` 命令时直接丢弃这个时钟
