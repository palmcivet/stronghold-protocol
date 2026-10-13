---
title: 舞台
description: createMissionStage 接收命令、每帧推进画面、拾取格子与单位，并把地面画布放进视口。
---

# 舞台

**舞台**是宿主与画面之间唯一的入口。宿主用 `dispatch` 推入命令，每帧调用 `update`，在指针事件里调用 `pick`，视口变化时调用 `resize`。舞台只读传入的数据，不修改它们。

```ts
import { createMissionStage } from "arknights-mission-renderer"

const stage = createMissionStage(null)
stage.dispatch({
  type: "set-map",
  map: {
    cols: 1,
    rows: 1,
    tiles: [{ x: 0, y: 0, height: 0, deployable: true, walkableBy: [] }],
  },
})
stage.dispatch({
  type: "set-camera",
  camera: { x: 0, y: 0, width: 1, height: 1, margin: 0.5 },
})
stage.resize(320, 320)
stage.update(1 / 60)
console.log(stage.view.map?.cols) // 1
```

## 创建参数

`createMissionStage(initialMap, options)` 的两个参数都可省略：

- `initialMap`：缺省为 `null`；传入时等同于紧接着 `dispatch({ type: "set-map", map })`
- `terrain`：地面的创建参数，见 [地面](./04-ground.md)；缺省时不建地面，`terrain` 与 `canvas` 都是 `null`
- `actors`：骨骼运行时与资源端口，见 [演员](./06-actor.md)；缺省时演员照常建立，但没有模型
- `impostor`：替身图集的页面尺寸、页数、取整网格，以及重画间隔与每单位像素数，见 [演员](./06-actor.md#替身)；缺省时骨骼都直接绘制
- `effects`、`cues`、`hud`：特效表、线索绑定与头顶条读数表，见 [特效与线索绑定](./07-effect.md)
- `onAudioCue`：收到音效线索，见 [音效线索](./08-audio.md)
- `onPointer`：收到 `pointer` 拾取后的指针事件
- `onUnboundCue`：每个没有绑定的线索键调用一次

`effects`、`cues` 与 `hud` 缺省时，舞台新建带引擎特效的特效表、带核心默认绑定的线索绑定和空的读数表。三张表在创建时封存；绑定与特效表不一致时抛出 `RangeError`。

## 方法

| 方法 | 作用 |
| --- | --- |
| `view` | 当前状态的只读快照 |
| `dispatch(command)` | 处理一条命令 |
| `update(deltaSeconds)` | 推进一帧 |
| `pick(x, y)` | 拾取单位、格子或空 |
| `pointer(phase, x, y)` | 拾取并交给 `onPointer` |
| `resize(width, height)` | 设置视口尺寸 |
| `destroy()` | 释放演员、特效、地面与资源句柄 |

- `pointer` 同时返回它交给 `onPointer` 的事件；`phase` 是 `down`、`move` 或 `up`
- `destroy` 不移除画布的 DOM 节点，节点由宿主移除

## 视图

`stage.view` 的字段：

- `map`、`camera`：当前地图与相机
- `snapshot`：最近一次推入的快照，本地模式下也是
- `units`：正在画的单位。外部模式下是最近快照的单位；本地模式下是渲染时钟上的插值结果
- `events`：最近 100 条已释放的事件，包括没有音效的事件
- `highlightedTiles`：最近一次 `set-highlights` 给出的格子
- `updateMode`：`external` 或 `local`
- `speed`：渲染时钟的速度，缺省 2，切换模式时保留
- `appearances`：到目前为止设置的表现数据，按单位 id

## 地图与相机

- 地图 `MissionMap` 有 `cols`、`rows` 与 `tiles`；`TileSpec` 来自 `arknights-mission-core`
- 坐标从 0 起算，`x` 从左往右，`y` 从下往上
- `tiles` 里没有列出的格子不建地面
- 地面另外读格子上可选的 `glyph`、`device`、`surface`；没有 `glyph` 时按 `device`、`objective`、`height`、`walkableBy` 推出
- 相机 `MissionCamera` 的 `x`、`y`、`width`、`height`、`margin` 都以格为单位；`(x, y)` 是矩形的左下角，`margin` 是四周留白
- 地图的 `enemyPreview` 是敌人预览区的矩形（`MissionTileRect`，以格为单位，`(x, y)` 是左下角）；只有它里面的通道与预览格画成玻璃，没有时都不画

## 命令

| 命令 | 作用 |
| --- | --- |
| `set-map` | 换地图，重建地面 |
| `set-camera` | 设置相机 |
| `set-highlights` | 替换高亮的格子 |
| `set-update-mode` | 切换 `external` 与 `local` |
| `set-speed` | 设置渲染时钟的速度 |
| `push-snapshot` | 推入一帧快照 |
| `push-event` | 推入一条事件 |
| `set-appearances` | 合并表现数据 |
| `reset` | 清空战斗状态 |

### `set-map`、`set-camera`、`set-highlights`

- `set-map`：地面清除旧场景、异步加载新的地形资源包，再按相机重算视口；单位、事件和高亮不变
- `set-camera`：同步给地面作为焦点，并重算视口
- `set-highlights`：替换 `view.highlightedTiles`，由地面绘制

### `set-update-mode`、`set-speed`

- 切到 `local`：建立渲染时钟（见 [本地喂数](./03-feed.md)），已有时只调整 `speed` 与 `delay`
- 从外部模式切入：最近的快照与尚未释放的事件送入时钟
- 切回 `external`：丢弃时钟；尚未释放的事件留到下一次 `update`；`view.units` 回到最近的快照
- `set-speed`：每真实秒的游戏秒数，夹在 0.05 到 20；缓冲不变

### `push-snapshot`、`push-event`

- `push-snapshot`：保存为 `view.snapshot`。外部模式下立即作为 `view.units`；本地模式下送入渲染时钟
- `push-event`：外部模式下等下一次 `update` 释放，事件引起的动画与音效线索落在同一帧；本地模式下按 tick 排队

### `set-appearances`、`reset`

- `set-appearances`：按单位 id 合并，已有的演员换上新的表现数据
- `reset`：清空快照、单位、事件、高亮与表现数据，释放全部演员，结束全部特效，模式回到 `external`，丢弃渲染时钟；地图、相机和地面保留

## 事件的释放

释放一条事件时，舞台依次：

1. 把事件追加到 `view.events`，超过 100 条时丢弃最早的
2. 交给演员：`deploy` 播部署动画，`attack` 播攻击动画，`downed` 进入倒下姿态，`removed` 开始淡出
3. 按线索绑定启动特效
4. 按线索绑定得到音效线索，交给 `onAudioCue`；`leak` 事件还让地面的目标门闪一下

## 每帧更新

`update(deltaSeconds)` 按 `MISSION_VIEW_SYSTEM_ORDER` 运行视图系统，再推进地面：

1. `ingest`：取出到期的事件；本地模式下先推进渲染时钟，并换上插值后的单位
2. `lifecycle`、`position`、`facing`、`skeleton`、`impostor`：演员的建立、位置、朝向、动画与替身
3. `hud`：头顶条
4. `effect`：推进已有特效，启动本帧线索的特效
5. `audio`：音效线索与目标门闪烁
6. `cull`：视锥外的演员与特效对象设为不可见；没有地面相机时不剔除
7. `release`：淡出完的演员归还对象池

## 视口

`resize(width, height)` 记录视口尺寸。视口变换由 `calculateBoardTransform` 算出，它也对外导出，供 HTML 覆盖层定位。

- 舞台内每格边长 64 像素，`scale` 是把内容放进视口的缩放
- 有相机时，内容是相机矩形加 `margin`，按这个范围铺满视口
- 没有相机时，内容是整张地图，缩放为铺满的 0.9 倍，并居中
- 地面的显示倍率同步设为 `scale`
- 视口未设置或地图为空时没有变换

## 拾取

`pick(screenX, screenY)` 的坐标相对于容器左上角：

1. 没有地图时返回 `empty`
2. 按视口变换换算成画布坐标；未调用 `resize` 时缩放为 1、原点为 (0, 0)
3. 用地面画面的同一个透视投影把画布坐标还原到棋盘上。每个单位在它自己高度的平面上还原，在 `view.units` 中找中心距离不超过 0.4 格的单位，跳过带 `hidden` 标记的
   - 取最近的；一样近时取画在上层的：先比高度，高的优先；再比行，行号小的优先
   - 找到时返回 `unit`
4. 格子从最高的表面往下逐层还原；落在抬高的平面上时，只有那一格确实这么高才算。落在 `map.tiles` 里的格子上时返回 `tile`
5. 其余返回 `empty`

## 画布

三维地面用一块 WebGL 画布。`stage.canvas` 在地面显示时返回画布，地面隐藏或 WebGL 上下文丢失时返回 `null`。

- 宿主把画布挂进容器一次即可，之后舞台用 `visibility` 控制显示
- 容器要是定位的祖先（例如 `position: relative`）
- 舞台设置画布的 `position: absolute`；`left`、`top` 取视口变换的位置；`width`、`height` 是棋盘尺寸乘 `scale`

## 地面

`stage.terrain` 是地面对象，见 [地面](./04-ground.md)。

- 演员、头顶条与特效挂在 `terrain.overlay` 下，随地面的场景绘制
- 舞台固定 `tileSize` 为 64，`options.terrain.tileSize` 不生效；其余参数原样传入
- 舞台先调用宿主的 `onMode`，再更新画布的样式
- 等待地形资源加载完成用 `stage.terrain?.ready`
