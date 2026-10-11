---
title: 契约
description: 地图、相机、视图、舞台命令、拾取结果和更新模式的类型定义。
---

# 契约

契约定义宿主和舞台之间传递的数据。舞台只读这些类型，不修改传入的对象。

## 地图

```ts
interface MissionMap {
  readonly cols: number
  readonly rows: number
  readonly tiles: readonly TileSpec[]
}
```

`cols` 和 `rows` 是棋盘的列数和行数。`TileSpec` 来自 `arknights-mission-core`，字段是 `x`、`y`、`height`、`deployable`、`walkableBy` 和可选的 `objective`。坐标从 0 起算，`x` 从左往右，`y` 从下往上。

地面还读取三个可选字段：`glyph`、`device`、`surface`。没有 `glyph` 时，地面按 `device`、`objective`、`height`、`walkableBy` 推出字形。`tiles` 里没有列出的格子不建地面。

## 相机

```ts
interface MissionCamera {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly margin: number
}
```

相机的 `x`、`y`、`width`、`height` 以棋盘格为单位，`(x, y)` 是矩形的左下角，`y` 向上增长。`margin` 是矩形四周的留白，单位也是格。相机决定视口中显示的范围，也决定地面的焦点，见 [舞台](./02-stage.md) 与 [地面](./04-ground.md)。

## 视图

```ts
interface MissionView {
  readonly map: MissionMap | null
  readonly camera: MissionCamera | null
  readonly snapshot: BattleSnapshot | null
  readonly units: readonly UnitSnapshot[]
  readonly events: readonly BattleEvent[]
  readonly highlightedTiles: readonly TileCoord[]
  readonly updateMode: MissionUpdateMode
  readonly speed: number
  readonly appearances: MissionAppearances
}
```

`view` 是舞台当前状态的只读快照。

- `snapshot` 是最近一次推入的快照，本地模式下也是。
- `units` 是舞台正在画的单位。外部模式下等于最近推入的快照中的单位；本地模式下是渲染时钟上的插值结果，见 [本地喂数](./03-feed.md)。
- `events` 保留最近 100 条已经释放的事件，包括没有音效的事件。
- `highlightedTiles` 是最近一次 `set-highlights` 给出的格子，由地面绘制。
- `speed` 是渲染时钟的速度，缺省 2，切换模式时保留。
- `appearances` 是到目前为止设置的表现数据，按单位 id。

## 命令

`dispatch` 接收的命令：

```ts
type MissionStageCommand =
  | { type: "set-map"; map: MissionMap }
  | { type: "set-camera"; camera: MissionCamera }
  | { type: "set-highlights"; tiles: readonly TileCoord[] }
  | { type: "set-update-mode"; mode: MissionUpdateMode; speed?: number; delay?: number }
  | { type: "set-speed"; speed: number }
  | { type: "push-snapshot"; snapshot: BattleSnapshot }
  | { type: "push-event"; event: BattleEvent }
  | { type: "set-appearances"; appearances: MissionAppearances }
  | { type: "reset" }
```

| 命令 | 作用 |
| --- | --- |
| `set-map` | 换成新地图，重建地面，并按当前相机重新铺满视口 |
| `set-camera` | 设置相机，并重新计算视口变换 |
| `set-highlights` | 替换 `highlightedTiles`，地面画出这些格子 |
| `set-update-mode` | 切换模式，`local` 时用 `speed` 和 `delay` 建立或调整渲染时钟；已缓冲的帧和待放的事件保留 |
| `set-speed` | 设置渲染时钟的速度（每真实秒的游戏秒数），夹在 0.05 到 20 |
| `push-snapshot` | 推入一帧快照 |
| `push-event` | 推入一条事件 |
| `set-appearances` | 按单位 id 合并表现数据，见 [演员](./07-actor.md) |
| `reset` | 清空快照、单位、事件、高亮、表现数据与演员，模式回到 `external`，地图与相机保留 |

命令在 [舞台](./02-stage.md) 中逐条说明。

## 更新模式

```ts
type MissionUpdateMode = "external" | "local"
```

- `external`：快照推入后立即生效，事件在下一次 `update` 释放。
- `local`：调用方每帧推入快照和事件，舞台按渲染时钟释放它们。见 [本地喂数](./03-feed.md)。

## 拾取结果

```ts
type MissionPointerHit =
  | { type: "unit"; unitId: string }
  | { type: "tile"; x: number; y: number }
  | { type: "empty" }
```

拾取规则见 [舞台](./02-stage.md#拾取)。

## 指针事件

```ts
type MissionPointerPhase = "down" | "move" | "up"

interface MissionPointerEvent {
  readonly phase: MissionPointerPhase
  readonly screenX: number
  readonly screenY: number
  readonly hit: MissionPointerHit
}
```

宿主把容器上的指针事件交给 `stage.pointer(phase, x, y)`，舞台拾取后把事件交给 `onPointer`。坐标相对视口。
