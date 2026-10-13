---
title: 音效线索
description: 战斗事件经线索绑定映射为音效线索 MissionAudioCue，由宿主决定播放什么、音量多少。
---

# 音效线索

渲染器不播放声音。它把事件翻译成音效线索，交给宿主。线索说明事件的类型和涉及的单位，播放由宿主的音频模块完成。

```ts
import { createMissionStage } from "arknights-mission-renderer"

declare const play: (type: string, unitId?: string) => void

export const stage = createMissionStage(null, {
  onAudioCue: (cue) => play(cue.type, cue.unitId),
})
```

`onAudioCue` 在事件被释放时调用。外部模式下是推入事件之后的下一次 `update`，本地模式下是渲染时钟到达事件 tick 的那一帧，见 [本地喂数](./03-feed.md)。

## 线索

线索类型 `MissionAudioCueType` 有 `attack`、`hit`、`skill`、`damage`、`heal`、`downed`、`break`、`deploy`、`leak`、`element`、`status`、`projectile`。`MissionAudioCue` 的字段都是只读的：`type`、`eventType`，以及可选的 `kind`、`unitId`、`targetId`、`skillSlot`、`asset`。

- `eventType` 是原始事件名。
- `kind` 只出现在 `cue` 事件的线索上，是它的种类。
- `unitId` 和 `targetId` 取自事件数据，有则带上。
- `skillSlot` 取自 `attack`、`attack-hit`、`hit` 的数据，是出手时生效的主动技能在技能列表里的下标。
- 宿主按它为技能期间的攻击、命中选音库，没有时用普通音库。
- `asset` 只在调用方传入 `audioFor` 时产生。

## 映射

每个事件的线索键与线索绑定见 [特效与线索绑定](./07-effect.md)。绑定的 `sound` 就是线索的 `type`，`null` 表示这个键不发声。核心事件的默认绑定：

| 事件 | 线索 |
| --- | --- |
| `attack` | `attack` |
| `attack-hit` | `hit` |
| `hit` | `hit` |
| `skill-start` | `skill` |
| `damaged` | `damage` |
| `heal` | `heal` |
| `fatal` | `downed` |
| `downed` | `downed` |
| `deploy` | `deploy` |
| `leak` | `leak` |
| `element-hit` | `element` |
| `element-burst` | `element` |
| `projectile` | `projectile` |
| `status` | `status` |

其余核心事件绑定为不发声。内容的 `cue:<kind>` 与模组事件按各自绑定发声，没有绑定的键不发声。

状态排在等待链上、前一个结束后接续时，核心不发 `status` 事件，所以接续不发 `status` 线索；只有新施加的状态发声。

## 函数

签名见 [API 参考](./09-api.md#音效线索)。

- `audioCueFor` 按绑定给出线索，没有声音时返回 `null`。`bindings` 缺省时只用核心事件的默认绑定。
- `effectCueFor` 在此基础上处理设备：`downed` 或 `fatal` 的单位是设备（`kind` 为 `device`）时，线索改为 `break`。`units` 是事件释放时的单位列表。
- `audioFor` 返回资源键时放入 `asset`，返回 `null` 时线索不带 `asset`。

## 先到的技能音

部署时释放的技能，`skill-start` 可能比单位先进入视图。`createSkillCueHold` 把这种 `skill` 线索按单位暂存，单位出现时放出一次。

- `pass(cue, known)` 在 `known(cue.unitId)` 为假时暂存 `skill` 线索并返回 `null`，其余线索原样返回。
- 每个单位只存最新的一条，总数不超过 `SKILL_HOLD_LIMIT`（64），超出时丢最早的。
- `release(known)` 返回已出现单位的暂存线索，每条只返回一次。
- `clear()` 丢掉全部暂存。舞台在 `set-map` 时先清空，再处理新地图的单位。

舞台每帧先放出暂存线索，再处理本帧事件。

舞台用自己的线索绑定调用 `effectCueFor`，不传 `audioFor`，所以舞台发出的线索没有 `asset`。宿主需要资源时，自行按 `eventType`、`kind` 或 `type` 查找。
