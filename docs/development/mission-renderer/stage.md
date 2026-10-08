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
  readonly terrain?: TerrainStageOptions
}

type MissionBoard = MissionStage & {
  readonly terrain: TerrainStage | null
  readonly canvas: TerrainRenderView["canvas"] | null
}
```

`initialMap` 缺省为 `null`，传入时等同于紧接着 `dispatch({ type: "set-map", map })`。`options.terrain` 缺省时，舞台不创建地面，`terrain` 与 `canvas` 都是 `null`。

## 方法

| 方法 | 作用 |
| --- | --- |
| `view` | 读取当前 `MissionView` |
| `dispatch(command)` | 处理一条命令，见下表 |
| `update(deltaSeconds)` | 推进一帧：本地模式下释放事件、插值单位，再推进地面 |
| `pick(screenX, screenY)` | 返回视口坐标下的单位、格子或空 |
| `resize(width, height)` | 设置视口尺寸，并重算视口变换 |
| `destroy()` | 释放地面的场景、地形资源句柄和 WebGL 视图 |

`destroy` 不移除画布的 DOM 节点，节点由宿主移除。

## 命令

| 命令 | 处理 |
| --- | --- |
| `set-map` | 保存地图，`terrain.setMap` 清除旧地面并异步加载新地形资源包，然后按相机重算视口。单位、事件和高亮保持不变 |
| `set-camera` | 保存相机，同步给地面作为焦点，并重算视口 |
| `set-highlights` | 替换 `view.highlightedTiles`。画面不绘制高亮 |
| `set-update-mode` | `local` 时新建一条渲染时钟（见 [本地喂数](./feed.md)）；`external` 时丢弃它。切换时之前缓冲的帧和事件都会丢弃 |
| `push-snapshot` | 保存为 `view.snapshot`。外部模式下立即作为 `view.units`；本地模式下送入渲染时钟，等下一次 `update` 生效 |
| `push-event` | 外部模式下立即释放；本地模式下按 tick 排队，等渲染时钟到达再释放 |
| `reset` | 清空快照、单位、事件和高亮，模式回到 `external`，并丢弃渲染时钟。地图、相机和地面保留 |

释放一条事件时，舞台做两件事：

1. 把事件追加到 `view.events`，超过 100 条时丢弃最早的。
2. 调用 `effectCueFor(event, units)` 得到音效线索，交给 `onAudioCue`。`leak` 事件还会让地面的目标门闪烁。

音效线索的映射见 [音效线索](./audio.md)。

## 更新

`update(deltaSeconds)` 的顺序：

1. 本地模式下，推进渲染时钟，取出到期的事件并释放，并把 `view.units` 换成插值结果。
2. 推进地面。
3. 把画布放到视口中。

`deltaSeconds` 是真实秒数。外部模式下只推进地面。

## 视口

`resize(width, height)` 记录视口尺寸。视口变换由 `calculateBoardTransform` 算出，它不对外导出。变换规则如下。

- 格子在舞台内的边长是 64 像素，变换的 `scale` 是把内容放进视口的缩放。
- 有相机时，内容是相机矩形加上 `margin` 的范围，缩放按这个范围铺满视口。
- 没有相机时，内容是整张地图，缩放为铺满视口的 0.9 倍，并居中。

视口变换算出后，地面的显示倍率同步设为 `scale`。视口未设置或地图为空时没有变换。

## 拾取

`pick(screenX, screenY)` 的坐标是相对于 `resize` 所用容器左上角的。规则如下。

1. 没有地图时返回 `empty`。
2. 把屏幕坐标换算成棋盘坐标。未调用 `resize` 时，缩放为 1，原点为 (0, 0)。
3. 依次检查 `view.units`，跳过带 `hidden` 标记的单位。单位中心距离点击位置不超过 0.4 格时，返回 `unit`。数组中先出现的单位优先，不取最近的。
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

`stage.terrain` 是地面对象，字段和方法见 [地面](./ground.md)。舞台创建地面时固定 `tileSize` 为 64，`options.terrain.tileSize` 不生效。`pixelRatio`、`resources`、`pack`、`view`、`available`、`onMode` 原样传入。`onMode` 在舞台内部先被包装：舞台先调用宿主的 `onMode`，再更新画布的样式。

等待地形资源加载完成可以使用 `stage.terrain?.ready`。
