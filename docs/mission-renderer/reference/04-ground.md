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

## 相机

地面用透视相机，缺省是官方的战斗视角：俯角 30°（偏离竖直向下，朝低行一侧），竖直视角 40°。

```ts
import {
  createMissionGround,
  frameProjection,
  projectPoint,
} from "arknights-mission-renderer"

const ground = createMissionGround({ projection: { pitch: 30, fovY: 40 } })
const projection = frameProjection(9, 5, null, 64)
console.log(ground.projection, projection && projectPoint(projection, 4, 2, 0))
```

- 取景：相机矩形（没有时是整张地图）在地面的投影正好放进舞台视口变换显示的那部分画布，居中，宽或高贴边
- 视角作用在那部分画布的高度上；主点用视图偏移放到取景位置
- `frameProjection(cols, rows, camera, tileSize, options)` 算出投影；`projectPoint`、`unprojectPoint` 在棋盘点与画布像素之间换算；`syncPerspectiveCamera` 把投影设到 Three 的透视相机上
- 演员与头顶条向后倾 90° 减俯角，正对相机，和参考实现一样竖直显示

## 创建参数

| 参数 | 缺省 | 含义 |
| --- | --- | --- |
| `available` | 有视图时 `true` | 是否允许显示 |
| `tileSize` | 64 | 每格的基准像素 |
| `pixelRatio` | 屏幕像素比，最大 `MISSION_GROUND_MAX_PIXEL_RATIO`（2） | 画布的像素比 |
| `resources` | 无 | 加载资源包的端口 |
| `pack` | 无 | 地形资源包 |
| `view` | 自动创建 | GPU 视图 |
| `onMode` | 无 | 显示模式变化时调用 |
| `onBeforeRender` | 无 | 每次绘制场景之前调用 |
| `projection` | `MISSION_PROJECTION` | 透视相机的竖直视角与俯角 |
| `atmosphere` | `MISSION_GROUND_ATMOSPHERE` | 清屏色与距离雾 |
| `areas` | 整张地图 | 只建这些区域里的格子 |
| `quality` | `high` | 画质：`low` 不画阴影 |
| `allowSlowGpu` | `false` | 软件或被列入黑名单的 GPU 也创建视图 |

- `available` 可以之后用 `setAvailable` 修改
- 舞台创建地面时固定 `tileSize` 为 64
- `resources` 只用到端口的 `image`、`model`、`json` 与 `release`，见 [资源端口](./05-port.md)
- `view` 为 `undefined` 时，`webgl2Available(allowSlowGpu)` 成立才创建带深度与模板缓冲的 WebGL 渲染器；为 `null` 时地面不显示
- 地面的 `renderer` 是视图的 WebGL 渲染器，没有视图时是 `null`

## 雾与清屏色

缺省和参考实现一样：清屏色 `0x0c1114`，雾从相机 17 格处开始，到 36 格处全浓，远处的棋盘渐隐进清屏色。

```ts
import { createMissionGround } from "arknights-mission-renderer"

export const ground = createMissionGround({
  atmosphere: { clear: null, fog: { color: 0x101820, near: 20, far: 40 } },
})
```

- `clear` 为 `null` 时画布透明，宿主页面的背景透出来
- `fog` 为 `null` 时不画雾
- 没写的项用 `MISSION_GROUND_ATMOSPHERE` 的值
- 清屏色在创建视图时设定；传入自己的 `view` 时由那个视图决定

## 区域

`areas` 是一组格子矩形，只建落在其中的格子；区域外的格子不画，像官方客户端只建当前阶段的场地。

```ts
import {
  createMissionGround,
  MISSION_GROUND_AREAS,
} from "arknights-mission-renderer"

const ground = createMissionGround({ areas: MISSION_GROUND_AREAS.normal })
ground.setAreas(MISSION_GROUND_AREAS.boss)
```

`MISSION_GROUND_AREAS` 是参考实现的四组区域：

| 键 | 区域 |
| --- | --- |
| `normal` | 己方场地（含分隔行）加敌人预览区；对局备战/作战默认只用场地块，预览区留给 pen 镜头 |
| `unite` | 联防时左右两半场地，加敌人预览区（对局默认同样先去掉预览区） |
| `boss` | 首领场地 |
| `all` | 整张棋盘 |

- `setAreas(areas)` 用当前的资源包重建场景；`null` 建整张地图
- `clipMapToAreas(map, areas)` 给出只留区域内格子的地图
- 高亮与 `surfaceHeight` 仍按整张地图算

## 画质

`setQuality("low")` 关掉主光的阴影，`setQuality("high")` 打开，不重建场景。没有 WebGL 渲染器时没有阴影可开关。

## WebGL 门控

`webgl2Available(allowSlow)` 判断浏览器能否画地面：要有 WebGL2。软件渲染或被列入黑名单的 GPU（`failIfMajorPerformanceCaveat`）算作不可用，除非 `allowSlow` 为真。没有 `document` 时为 `false`。

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
- `projection`：棋盘到画布的透视投影，没有地图时是 `null`；舞台的拾取用同一个投影
- `camera`：绘制用的透视相机，与 `projection` 投影一致，场景建好之前是 `null`；舞台的 `cull` 系统用它的视锥剔除
- `surfaceHeight(x, y)`：棋盘表面在某格的高度（格），按地图算出，不依赖资源包；不在地图上时为 0
- `ready`：`setMap` 之后的一个 Promise，资源包加载结束时完成；没有资源包时立即完成

## 方法

- `setMap(map)`：销毁旧场景，交还资源包的引用，保存新地图，异步加载资源包并建场景
- `setCamera(camera)`：相机矩形作为焦点，并按它重新取景；焦点外的材质按距离渐暗；`null` 时没有焦点，取景整张地图
- `setDisplayScale(scale)`：设置显示缩放，非正数被忽略
- `setAvailable(available)`：开关地面，并刷新模式
- `setAreas(areas)`：只建这些区域里的格子，重建场景；`areas` 返回当前区域
- `setQuality(quality)`：`low` 关掉阴影，`high` 打开；`quality` 返回当前画质
- `setHighlights(tiles)`：替换高亮的格子；样式见 `MISSION_GROUND_HIGHLIGHT`；换地图时按新的表面高度重画
- `setBlowerFacings(facings)`：把地图上的风机模型转向给出的朝向，每项是 `{ x, y, facing }`；场景重建后仍然生效；`blowerFacings` 返回最后给出的值
- `setCrateTiles(tiles)`：只显示给出格子上的箱子模型，每项是 `{ x, y }`；`null` 时显示地图上的全部箱子；场景重建后仍然生效
- `flashObjective()`：让门闪一下，舞台在 `leak` 事件时调用
- `update(deltaSeconds)`：推进动画，显示时渲染一帧
- `destroy()`：移除上下文事件的监听，销毁场景，交还资源包的引用，释放视图

舞台每收到一个快照，就用 `deviceTiles(snapshot)` 取出装置单位（风机除外）所在的格子，交给 `setCrateTiles`，所以被摧毁的箱子不再显示；`reset` 时恢复全部箱子。

风机模型缺省朝上。舞台每收到一个快照，就用 `blowerFacings(snapshot)` 取出带 `blower` 标签的单位所在的格子与朝向，交给 `setBlowerFacings`，所以模型与核心的气流方向一致。

销毁场景时，地面释放它自己建的几何体、材质、边界虚线纹理与环境光照的渲染目标。资源包里的贴图不归地面所有：地面只交还引用，最后一个引用交还时由资源端口释放。

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
