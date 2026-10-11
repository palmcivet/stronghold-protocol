---
title: 地面
description: createMissionGround 用 Three.js 绘制棋盘地面，按图集、WebGL 视图和上下文状态切换显示，并通过地形资源包加载贴图与模型。
---

# 地面

三维地面由 `createMissionGround` 创建。它把一张 `MissionMap` 画成棋盘，包括格子表面、高台、栏杆、门、设备和背景，并带灯光与阴影。舞台通过 `options.terrain` 创建它，宿主也可以单独使用。

地面对外的名字带 `MissionGround` 前缀（常量是 `MISSION_GROUND_`），包内只在不导出的部分沿用 `Terrain*`。

```ts
import { createMissionGround } from "arknights-mission-renderer"

const terrain = createMissionGround({
  resources: port,
  pack: { images: { diffuse: "texture:map/autochess/TX_autochessi_D" } },
  pixelRatio: window.devicePixelRatio,
  onMode: (mode) => console.log(mode),
})
terrain.setMap(map)
await terrain.ready
```

## 创建参数

```ts
interface MissionGroundOptions {
  readonly available?: boolean
  readonly tileSize?: number
  readonly pixelRatio?: number
  readonly resources?: Pick<MissionResourcePort, "image" | "model" | "json" | "release">
  readonly pack?: MissionGroundPack
  readonly view?: TerrainRenderView | null
  readonly onMode?: (mode: MissionGroundMode) => void
}
```

| 参数 | 缺省 | 含义 |
| --- | --- | --- |
| `available` | 有视图时为 `true`，否则 `false` | 是否允许显示三维地面，可用 `setAvailable` 修改 |
| `tileSize` | 64 | 每格的基准像素。舞台创建地面时固定为 64 |
| `pixelRatio` | 1 | 画布的像素比，画布的绘制缓冲为显示尺寸乘像素比 |
| `resources` | 无 | 加载地形资源包用的端口，见 [资源端口](./05-port.md) |
| `pack` | 无 | 地形资源包的请求，见下文 |
| `view` | 自动创建 | GPU 视图。`undefined` 时尝试创建带深度与模板缓冲的 WebGL 渲染器，`null` 时地面不显示 |
| `onMode` | 无 | 显示模式变化时调用 |

## 显示模式

```ts
type MissionGroundMode = "terrain" | "hidden"
```

地面只在下面三个条件同时成立时显示为 `terrain`：

1. `available` 为 `true`。
2. 地形资源包已加载，场景已建好。
3. 有 GPU 视图，并且 WebGL 上下文没有丢失。

其余情况为 `hidden`，画布隐藏，`canvas` 为 `null`。`onMode` 只在模式改变时调用。

资源包缺失、加载失败、没有 WebGL、上下文丢失，都落到 `hidden`。地面隐藏时，画面上不会出现二维棋盘；格子的拾取仍由舞台完成，见 [舞台](./02-stage.md#拾取)。

## 对象

```ts
interface MissionGround {
  readonly mode: MissionGroundMode
  readonly canvas: TerrainRenderView["canvas"] | null
  readonly boardWidth: number
  readonly boardHeight: number
  readonly layout: TerrainLayout | null
  readonly overlay: Group
  readonly highlights: Group
  readonly camera: OrthographicCamera | null
  readonly surfaceHeight: (x: number, y: number) => number
  readonly setHighlights: (tiles: readonly TileCoord[]) => void
  readonly ready: Promise<void>
  readonly setMap: (map: MissionMap) => void
  readonly setCamera: (camera: MissionCamera | null) => void
  readonly setDisplayScale: (scale: number) => void
  readonly setAvailable: (available: boolean) => void
  readonly flashObjective: () => void
  readonly update: (deltaSeconds: number) => void
  readonly destroy: () => void
}
```

- `boardWidth`、`boardHeight` 是地图的 `cols × tileSize` 与 `rows × tileSize`。没有地图时为 0。
- `layout` 是场景建好后的几何数据，包括格子、门与边界，供检查使用。
- `overlay` 每次建好场景时加进场景，舞台把演员与头顶条挂在它下面。坐标与场景相同：x 为列，y 为高度，z 为负的行。
- `highlights` 是高亮格子的方块，同样随场景绘制。
- `surfaceHeight(x, y)` 返回棋盘表面在某格的高度（格），按地图的高台类别算出，不依赖资源包；不在地图上时为 0。演员站在这个高度上。
- `ready` 在 `setMap` 之后变为一个 Promise，地形资源包加载结束时完成。没有资源包时立即完成。

### 方法

- `setMap(map)`：释放旧场景和资源包，保存新地图，然后异步加载资源包并建立场景。
- `camera`：绘制场景用的正交相机，场景建好之前是 `null`。舞台的 `cull` 系统用它的视锥剔除。
- `setCamera(camera)`：把相机矩形作为焦点。焦点内的材质保持亮度，焦点外的材质按距离渐暗。传入 `null` 时没有焦点。
- `setDisplayScale(scale)`：设置显示缩放。非正数被忽略。画布尺寸随之变化。
- `setAvailable(available)`：开关地面，并刷新模式。
- `setHighlights(tiles)`：替换高亮的格子。每格画一块平放的方块，颜色、透明度、边长与离地高度见 `MISSION_GROUND_HIGHLIGHT`。换地图时按新地图的表面高度重画。
- `flashObjective()`：让门闪一下，舞台在 `leak` 事件时调用。
- `update(deltaSeconds)`：推进动画，显示时渲染一帧。
- `destroy()`：移除 WebGL 上下文事件的监听，释放场景、资源句柄和视图。

## 地形资源包

`pack` 描述要加载的贴图和模型。每一项都可省略，只有 `images.diffuse` 是必需的。

```ts
interface MissionGroundPack {
  readonly images: Partial<Record<MissionGroundImageSlot, AssetKey>>
  readonly meshes?: Partial<Record<TerrainMeshSlot, AssetKey>>
  readonly gates?: Partial<Record<TerrainGateSlot, AssetKey>>
  readonly gatePrefab?: AssetKey
  readonly resolveMesh?: (name: string) => AssetKey | null
  readonly tiles?: AssetKey
}
```

| 字段 | 内容 |
| --- | --- |
| `images` | 图集贴图，键见 `MISSION_GROUND_IMAGE_SLOTS`：`diffuse`（漫反射，必需）、`normal`（法线）、`roughness`（粗糙度）、`emissive`（自发光）、`common`（公共图集）、`commonEmissive`（公共图集的自发光）、`background`（背景）、`wind`、`gate`、`waterNormal`（水面法线）、`caustics`、`noise` |
| `meshes` | 模型，键见 `MISSION_GROUND_MESH_SLOTS`：`crate`、`blower`、`bgPlane` |
| `gates` | 门与目标的部件模型，键见 `MISSION_GROUND_GATE_NODES`：`startDown`、`startUp`、`startBack`、`endDown`、`endUp` |
| `gatePrefab` | 预制件表（JSON）。把节点名映射到模型名，用于 `gates` 中没有给出的部件 |
| `resolveMesh` | 把预制件表里的模型名映射为资源键 |
| `tiles` | 棋盘 tiles（`json:board/<theme>/tiles`）。其中的 `board3d` 段替换表面在图集中的矩形 |

`MISSION_GROUND_GATE_NODES` 把部件槽位映射到预制件的节点名，例如 `startDown` 对应 `Start_down`。`startBack` 只在 `[opt]start_box` 下的节点上生效。

### 加载规则

- `images.diffuse` 加载失败，或加载到的值不是 Three.js 的 `Texture`，整个资源包作废，地面隐藏。
- 其他图片、模型、预制件表、棋盘 tiles 各自失败时只影响自己对应的部分，其余照常。
- 模型可以是 OBJ 文本、已解析的网格，或 Three.js 的 `Object3D`。

## WebGL 上下文

上下文丢失时，地面立即隐藏，`onMode` 收到 `hidden`。上下文恢复后，地面用当前地图重新加载资源包并重建场景。单位和战斗状态不受影响，因为它们不在地面里。

## 画布

视图创建的画布由地面持有，尺寸为显示尺寸乘像素比。`canvas` 在 `terrain` 模式下返回画布，`hidden` 时为 `null`。画布的 DOM 位置由舞台或宿主决定，见 [舞台的画布](./02-stage.md#画布)。
