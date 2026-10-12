---
title: 作战画面
description: arknights-mission-renderer 把战斗快照和事件画成三维战场，并提供拾取、本地逐帧喂数、资源端口和音效线索。
---

# arknights-mission-renderer

`arknights-mission-renderer` 回答一个问题：**一串战斗快照和事件，怎样画成一块可以点选的战场**。

它用 Three.js 绘制三维地面与单位。单位的 Spine 骨骼用 pixi-spine 的 3.8 运行时计算，再由自建的 Three 网格绘制。

## 边界

- 不判断命中、不计算伤害、不决定移动：这些由 [arknights-mission-core](../mission-core/index.md) 完成
- 同一份快照和事件序列，换一套画法不改变战斗结果
- 不读文件：资源按键经 [资源端口](./05-port.md) 申请，加载函数由宿主提供
- 不播放声音：事件变成 [音效线索](./08-audio.md)，交给宿主
- 没有 WebGL 时地面隐藏，舞台仍接收快照与事件、拾取格子并发出音效线索

## 最小示例

```ts
import type { BattleEvent, BattleSnapshot } from "arknights-mission-core"
import { createMissionStage, type MissionMap } from "arknights-mission-renderer"

const map: MissionMap = {
  cols: 2,
  rows: 1,
  tiles: [
    { x: 0, y: 0, height: 0, deployable: true, walkableBy: ["ground"] },
    { x: 1, y: 0, height: 0, deployable: true, walkableBy: ["ground"] },
  ],
}

const stage = createMissionStage(map, {
  onAudioCue: (cue) => console.log(cue.type, cue.unitId),
})
stage.resize(640, 360)

// 每当战斗推进一步，宿主把快照和事件交给舞台
export function onBattle(
  snapshot: BattleSnapshot,
  events: readonly BattleEvent[],
): void {
  stage.dispatch({ type: "push-snapshot", snapshot })
  for (const event of events) {
    stage.dispatch({ type: "push-event", event })
  }
}

stage.update(1 / 60)
console.log(stage.pick(320, 180).type) // "tile"
```

这个示例没有地面与模型：只有棋盘的拾取与音效线索。加上三维地面和 Spine 模型见 [快速开始](./01-quick-start.md)。

## 核心概念

- [舞台](./02-stage.md)：命令、每帧更新、拾取、视口与画布
- [本地喂数](./03-feed.md)：`local` 模式下用渲染时钟插值单位、按 tick 释放事件
- [地面](./04-ground.md)：三维棋盘、地形资源包与显示模式
- [资源端口](./05-port.md)：按资源键申请图片、Spine、模型与 JSON
- [演员](./06-actor.md)：单位的模型、动画、头顶条与替身
- [特效与线索绑定](./07-effect.md)：事件画哪种特效、发哪种声音
- [音效线索](./08-audio.md)：交给宿主播放的声音提示

## 下一步

- 从零跑通一遍：[快速开始](./01-quick-start.md)
- 查接口：[核心接口](./09-api.md)
- 了解整体设计：[架构设计](./10-architecture.md)
