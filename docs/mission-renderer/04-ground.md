---
title: 地面
description: createMissionGround 用 Three.js 绘制棋盘地面，按资源包、WebGL 视图和上下文状态切换显示。
---

# 地面

三维**地面**把一张 `MissionMap` 画成棋盘：格子表面、高台、栏杆、门、设备和背景，带灯光与阴影。舞台通过 `options.terrain` 创建它，也可以单独使用。

```ts
import {
  createMissionGround,
  type MissionResourcePort,
} from "arknights-mission-renderer"

export async function showGround(port: MissionResourcePort): Promise<void> {
  const ground = createMissionGround({
    resources: port,
    pack: { images: { diffuse: "texture:board/stone_D" } },
    pixelRatio: window.devicePixelRatio,
    onMode: (mode) => console.log(mode),
  })
  ground.setMap({
    cols: 1,
    rows: 1,
    tiles: [{ x: 0, y: 0, height: 0, deployable: true, walkableBy: [] }],
  })
  await ground.ready
}
```

## 创建参数

| 参数 | 缺省 | 含义 |
| --- | --- | --- |
| `available` | 有视图时 `true` | 是否允许显示 |
| `tileSize` | 64 | 每格的基准像素 |
| `pixelRatio` | 1 | 画布的像素比 |
| `resources` | 无 | 加载资源包的端口 |
| `pack` | 无 | 地形资源包 |
| `view` | 自动创建 | GPU 视图 |
| `onMode` | 无 | 显示模式变化时调用 |

- `available` 可以之后用 `setAvailable` 修改
- 舞台创建地面时固定 `tileSize` 为 64
- `resources` 只用到端口的 `image`、`model`、`json` 与 `release`，见 [资源端口](./05-port.md)
- `view` 为 `undefined` 时尝试创建带深度与模板缓冲的 WebGL 渲染器；为 `null` 时地面不显示

## 显示模式

模式是 `terrain` 或 `hidden`。三个条件同时成立时为 `terrain`：

1. `available` 为 `true`
2. 地形资源包已加载，场景已建好
3. 有 GPU 视图，并且 WebGL 上下文没有丢失

其余情况为 `hidden`：画布隐藏，`canvas` 为 `null`。

- 资源包缺失、加载失败、没有 WebGL、上下文丢失，都落到 `hidden`
- 隐藏时不画二维棋盘；格子的拾取仍由舞台完成
- `onMode` 只在模式改变时调用

## 字段

- `boardWidth`、`boardHeight`：`cols × tileSize` 与 `rows × tileSize`，没有地图时为 0
- `layout`：场景建好后的几何数据（格子、门与边界）
- `overlay`：每次建好场景时加进场景；舞台把演员与头顶条挂在下面。坐标与场景相同：x 为列，y 为高度，z 为负的行
- `highlights`：高亮格子的方块
- `camera`：绘制用的正交相机，场景建好之前是 `null`；舞台的 `cull` 系统用它的视锥剔除
- `surfaceHeight(x, y)`：棋盘表面在某格的高度（格），按地图算出，不依赖资源包；不在地图上时为 0
- `ready`：`setMap` 之后的一个 Promise，资源包加载结束时完成；没有资源包时立即完成

## 方法

- `setMap(map)`：释放旧场景和资源包，保存新地图，异步加载资源包并建场景
- `setCamera(camera)`：相机矩形作为焦点；焦点外的材质按距离渐暗；`null` 时没有焦点
- `setDisplayScale(scale)`：设置显示缩放，非正数被忽略
- `setAvailable(available)`：开关地面，并刷新模式
- `setHighlights(tiles)`：替换高亮的格子；样式见 `MISSION_GROUND_HIGHLIGHT`；换地图时按新的表面高度重画
- `flashObjective()`：让门闪一下，舞台在 `leak` 事件时调用
- `update(deltaSeconds)`：推进动画，显示时渲染一帧
- `destroy()`：移除上下文事件的监听，释放场景、资源句柄和视图

## 地形资源包

`pack` 描述要加载的贴图和模型。只有 `images.diffuse` 是必需的。

| 字段 | 内容 |
| --- | --- |
| `images` | 图集贴图，按槽位 |
| `meshes` | 模型：`crate`、`blower`、`bgPlane` |
| `gates` | 门与目标的部件模型 |
| `gatePrefab` | 预制件表（JSON） |
| `resolveMesh` | 预制件里的模型名 → 资源键 |
| `tiles` | 棋盘 tiles（JSON） |

- `images` 的槽位见 `MISSION_GROUND_IMAGE_SLOTS`：
  - `diffuse`（漫反射，必需）、`normal`（法线）、`roughness`（粗糙度）
  - `emissive`（自发光）、`common`（公共图集）、`commonEmissive`
  - `background`（背景）、`wind`、`gate`
  - `waterNormal`（水面法线）、`caustics`、`noise`
- `meshes` 的槽位见 `MISSION_GROUND_MESH_SLOTS`
- `gates` 的槽位是 `startDown`、`startUp`、`startBack`、`endDown`、`endUp`
  - `MISSION_GROUND_GATE_NODES` 把槽位映射到预制件的节点名，例如 `startDown` 对应 `Start_down`
  - `startBack` 只在 `[opt]start_box` 下的节点上生效
- `gatePrefab` 把节点名映射到模型名，用于 `gates` 里没给出的部件
- `tiles` 里的 `board3d` 段替换表面在图集中的矩形

加载规则：

- `images.diffuse` 加载失败，或加载到的不是 Three.js 的 `Texture`，整个资源包作废，地面隐藏
- 其他图片、模型、预制件表、棋盘 tiles 各自失败时只影响自己的部分
- 模型可以是 OBJ 文本、已解析的网格，或 Three.js 的 `Object3D`

## WebGL 上下文

- 上下文丢失时，地面立即隐藏，`onMode` 收到 `hidden`
- 上下文恢复后，用当前地图重新加载资源包并重建场景
- 单位和战斗状态不在地面里，不受影响

## 画布

视图创建的画布由地面持有，尺寸为显示尺寸乘像素比。画布的 DOM 位置由舞台或宿主决定，见 [舞台的画布](./02-stage.md#画布)。
