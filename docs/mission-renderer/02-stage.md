---
title: 舞台
description: createMissionStage 接收命令、推进画面、拾取格子与单位，并把地面画布放进视口。
---

# 舞台

`createMissionStage` 创建一座舞台。宿主通过 `dispatch` 推入命令，每帧调用 `update`，在指针事件里调用 `pick`，在视口变化时调用 `resize`。

```ts
function createMissionStage(
  initialMap?: MissionMap | null,
  options?: MissionStageOptions,
): MissionBoard

interface MissionStageOptions {
  readonly onAudioCue?: (cue: MissionAudioCue) => void
  readonly onPointer?: (event: MissionPointerEvent) => void
  readonly terrain?: MissionGroundOptions
  readonly actors?: MissionActorWorldOptions
}

type MissionBoard = MissionStage & {
  readonly terrain: MissionGround | null
  readonly canvas: TerrainRenderView["canvas"] | null
  readonly actors: MissionActorWorld
  readonly hud: MissionHudLayer
}
```

`initialMap` 缺省为 `null`，传入时等同于紧接着 `dispatch({ type: "set-map", map })`。`options.terrain` 缺省时，舞台不创建地面，`terrain` 与 `canvas` 都是 `null`。`options.actors` 给出骨骼运行时与资源端口，缺省时演员照常建立，但没有模型。演员与头顶条见 [演员](./07-actor.md)。

## 方法

| 方法 | 作用 |
| --- | --- |
| `view` | 读取当前 `MissionView` |
| `dispatch(command)` | 处理一条命令，见下表 |
| `update(deltaSeconds)` | 按视图系统的顺序推进一帧，再推进地面 |
| `pick(screenX, screenY)` | 返回视口坐标下的单位、格子或空 |
| `pointer(phase, screenX, screenY)` | 拾取并把指针事件交给 `onPointer`，同时返回它 |
| `resize(width, height)` | 设置视口尺寸，并重算视口变换 |
| `destroy()` | 释放演员、地面的场景、地形资源句柄和 WebGL 视图 |

`destroy` 不移除画布的 DOM 节点，节点由宿主移除。

## 命令

| 命令 | 处理 |
| --- | --- |
| `set-map` | 保存地图，`terrain.setMap` 清除旧地面并异步加载新地形资源包，然后按相机重算视口。单位、事件和高亮保持不变 |
| `set-camera` | 保存相机，同步给地面作为焦点，并重算视口 |
| `set-highlights` | 替换 `view.highlightedTiles`，交给地面绘制 |
| `set-update-mode` | `local` 时建立渲染时钟（见 [本地喂数](./03-feed.md)），已有时只调整速度与延迟；从外部模式切入时，最近的快照与尚未释放的事件送入时钟。`external` 时丢弃时钟，尚未释放的事件留到下一次 `update` 释放，`view.units` 回到最近的快照 |
| `set-speed` | 设置 `view.speed`，并调整渲染时钟的速度，缓冲不变 |
| `push-snapshot` | 保存为 `view.snapshot`。外部模式下立即作为 `view.units`；本地模式下送入渲染时钟，等下一次 `update` 生效 |
| `push-event` | 外部模式下不在 `dispatch` 里立即释放，而是等下一次 `update` 的 `ingest` 系统释放，这样事件引起的演员动画与音效线索落在同一帧；本地模式下按 tick 排队，等渲染时钟到达再释放 |
| `set-appearances` | 按单位 id 合并进 `view.appearances`，已有的演员换上新的表现数据 |
| `reset` | 清空快照、单位、事件、高亮与表现数据，释放全部演员，模式回到 `external`，并丢弃渲染时钟。地图、相机和地面保留 |

释放一条事件时，舞台做三件事：

1. 把事件追加到 `view.events`，超过 100 条时丢弃最早的。
2. 交给演员：`deploy` 播部署动画，`attack` 播攻击动画，`downed` 进入倒下姿态，`removed` 开始淡出。
3. 调用 `effectCueFor(event, units)` 得到音效线索，交给 `onAudioCue`。`leak` 事件还会让地面的目标门闪烁。

音效线索的映射见 [音效线索](./06-audio.md)。

## 更新

`update(deltaSeconds)` 按 `MISSION_VIEW_SYSTEM_ORDER` 运行视图系统：

1. `ingest`：本地模式下推进渲染时钟、取出到期的事件，并把 `view.units` 换成插值结果；外部模式下取出推入以来的事件。
2. `lifecycle`、`position`、`facing`、`skeleton`：演员的建立、位置、朝向与动画。
3. `hud`：头顶条。
4. `effect`：特效（还没有注册的系统）。
5. `audio`：音效线索与目标门闪烁。
6. `cull`：视口剔除（还没有注册的系统）。
7. `release`：淡出的演员归还对象池。

之后推进地面，并把画布放到视口中。`deltaSeconds` 是真实秒数。

## 视口

`resize(width, height)` 记录视口尺寸。视口变换由 `calculateBoardTransform` 算出，它也对外导出，供 HTML 覆盖层定位。变换规则如下。

- 格子在舞台内的边长是 64 像素，变换的 `scale` 是把内容放进视口的缩放。
- 有相机时，内容是相机矩形加上 `margin` 的范围，缩放按这个范围铺满视口。
- 没有相机时，内容是整张地图，缩放为铺满视口的 0.9 倍，并居中。

视口变换算出后，地面的显示倍率同步设为 `scale`。视口未设置或地图为空时没有变换。

## 拾取

`pick(screenX, screenY)` 的坐标是相对于 `resize` 所用容器左上角的。规则如下。

1. 没有地图时返回 `empty`。
2. 把屏幕坐标换算成棋盘坐标。未调用 `resize` 时，缩放为 1，原点为 (0, 0)。
3. 检查 `view.units`，跳过带 `hidden` 标记的单位。单位中心距离点击位置不超过 0.4 格的单位中，取最近的；一样近时取画在上层的：先比高度，高的优先，再比行，靠前（行号小）的优先。返回 `unit`。
4. 点击位置落在地图内的格子上，且该格子在 `map.tiles` 中时，返回 `tile`。
5. 其余情况返回 `empty`。

## 画布

三维地面使用一块 WebGL 画布。舞台给画布设置样式：

- `position: absolute`，`left` 和 `top` 为视口变换的位置，`width` 和 `height` 为棋盘尺寸乘 `scale`。
- `visibility` 在地面可见时为 `visible`，否则为 `hidden`。

`stage.canvas` 在地面处于 `terrain` 模式时返回画布；地面隐藏或 WebGL 上下文丢失时返回 `null`。宿主需要自己把画布挂进容器，挂一次即可，之后画布的显示由舞台通过 `visibility` 控制：

```ts
if (stage.canvas instanceof HTMLCanvasElement && stage.canvas.parentElement !== host) {
  host.append(stage.canvas)
}
```

容器需要是定位的祖先（例如 `position: relative`），画布的坐标才与 `resize` 的视口对齐。

## 地面

`stage.terrain` 是地面对象，字段和方法见 [地面](./04-ground.md)。演员与头顶条挂在 `terrain.overlay` 下，随地面的场景一起绘制。舞台创建地面时固定 `tileSize` 为 64，`options.terrain.tileSize` 不生效。`pixelRatio`、`resources`、`pack`、`view`、`available`、`onMode` 原样传入。`onMode` 在舞台内部先被包装：舞台先调用宿主的 `onMode`，再更新画布的样式。

等待地形资源加载完成可以使用 `stage.terrain?.ready`。
