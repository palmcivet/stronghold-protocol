---
title: 音效线索
description: 战斗事件映射为音效线索 MissionAudioCue，由宿主决定播放什么、音量多少。
---

# 音效线索

渲染器不播放声音。它把事件翻译成音效线索，交给宿主。线索说明事件的类型和涉及的单位，播放由宿主的音频模块完成。

```ts
import { createMissionStage } from "arknights-mission-renderer"

const stage = createMissionStage(map, {
  onAudioCue: (cue) => audio.play(cue.type, cue.unitId),
})
```

`onAudioCue` 在事件被释放时调用。外部模式下是推入事件的那一刻，本地模式下是渲染时钟到达事件 tick 的那一帧，见 [本地喂数](./feed.md)。

## 线索

```ts
interface MissionAudioCue {
  readonly type:
    | "attack"
    | "hit"
    | "skill"
    | "damage"
    | "heal"
    | "downed"
    | "break"
    | "deploy"
    | "leak"
    | "element"
    | "status"
    | "projectile"
  readonly eventType: string
  readonly unitId?: string
  readonly targetId?: string
  readonly asset?: AssetKey
}
```

`eventType` 是原始事件名。`unitId` 和 `targetId` 取自事件数据，有则带上。`asset` 只在调用 `audioCueFor` 时由调用方传入的 `audioFor` 产生。

## 映射

`audioCueFor(event)` 对下列事件给出线索，其它事件返回 `null`。

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
| `elementHit` | `element` |
| `elementBurst` | `element` |
| `projectile` | `projectile` |
| `status` | `status` |

`effectCueFor(event, units)` 在上面的基础上处理设备：`downed` 或 `fatal` 的单位是设备（`kind` 为 `device`）时，线索改为 `break`。`units` 是事件释放时的单位列表，用来查找单位的类型。

## 资源句柄

```ts
type EffectAudioFor = (event: BattleEvent, type: MissionAudioCue["type"]) => AssetKey | null
```

`audioCueFor(event, audioFor)` 调用 `audioFor` 得到资源键，并放入 `asset`。`audioFor` 返回 `null` 时，线索不带 `asset`。

舞台内部调用 `effectCueFor` 时不传入 `audioFor`，所以舞台发出的线索没有 `asset`。宿主需要资源时，自行按 `eventType` 或 `type` 查找。
