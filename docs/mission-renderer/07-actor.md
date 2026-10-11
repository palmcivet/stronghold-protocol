---
title: 演员
description: 快照里的每个单位对应一个演员；表现数据决定它的模型、缩放与头顶条，骨骼端口负责动画与绘制。
---

# 演员

舞台为快照中的每个单位建立一个演员。演员只读快照的顶层字段（位置、高度、朝向、`downed`、生命、生效的最大生命 `maxHp`、护盾）与组件视图（如 `attack:stand`，类型是核心导出的 `AttackStandView`），不推断玩法。模型、缩放、镜像这些纯表现的数据由宿主通过 `set-appearances` 给出。

```ts
import { createMissionResourcePort, createMissionSkeletonLoader, createMissionSkeletonRuntime, createMissionStage } from "arknights-mission-renderer"

const skeleton = createMissionSkeletonRuntime()
const resources = createMissionResourcePort({
  resolver,
  image: (url) => textureLoader.loadAsync(url),
  spine: createMissionSkeletonLoader(skeleton, {
    bytes: async (url) => new Uint8Array(await (await fetch(url)).arrayBuffer()),
    text: async (url) => (await fetch(url)).text(),
    texture: (url) => textureLoader.loadAsync(url),
  }),
  model: (url) => loadModel(url),
  json: async (url) => (await fetch(url)).json(),
})

const stage = createMissionStage(map, { terrain, actors: { skeleton, resources } })
stage.dispatch({ type: "set-appearances", appearances: { guard: appearanceOfGuard } })
```

## 表现数据

```ts
interface MissionAppearance {
  readonly spine: AssetKey // 骨骼资源键
  readonly roles: MissionAnimRoles // 动画角色表
  readonly scale: number // 模型缩放
  readonly scaleY: number // 在 scale 之上的纵向缩放
  readonly mirrorX: boolean // 单位朝右时模型朝左
  readonly offset: { readonly x: number; readonly y: number; readonly z: number } // 格，x 沿列、y 沿行、z 向上
  readonly tint?: number // 0xRRGGBB，乘进模型颜色
  readonly hpBar?: boolean // 缺省 true
}
```

`set-appearances` 按单位 id 合并，后给的覆盖先给的。动画角色表由数据包按骨骼的动画名算出（`json:anim-roles/<seasonId>`），画面只读它：

```ts
interface MissionAnimRoles {
  readonly idle: string | null
  readonly deploy: string | null
  readonly attack: MissionAnimClip | null
  readonly attackDown: MissionAnimClip | null
  readonly skill: MissionSkillClip | null
  readonly skills?: Readonly<Record<string, MissionSkillClip>>
  readonly die: string | null
  readonly move: MissionAnimClip | null
  readonly stun: MissionAnimClip | null
}
```

## 生命周期

| 时机 | 演员 |
| --- | --- |
| 单位第一次出现在快照中 | 从对象池按单位种类取出根节点，建立演员；有表现数据时经资源端口申请骨骼并创建实例 |
| `deploy` 事件 | 播部署动画，之后回到待机 |
| `attack` 事件 | 播攻击动画，之后回到待机 |
| 快照中位置在两帧之间变化 | 播移动动画 |
| `downed` 事件，或快照 `downed` 为 true | 播倒下动画并停在最后一帧，头顶条隐藏 |
| 快照 `downed` 回到 false | 回到站立 |
| `removed` 事件，或单位不再出现在快照中 | 在 `MISSION_ACTOR_FADE_SECONDS`（0.6 秒）内淡出，之后释放骨骼实例与资源句柄，根节点归还对象池 |

演员的根节点在场景坐标中（x 为列，y 为高度，z 为负的行），位置是单位位置加 `offset`。朝向取快照的 `facing`：朝左时水平翻转，`mirrorX` 再翻转一次。缩放为 `scale`，纵向再乘 `scaleY`。

## 头顶条

头顶条画在站立的演员上方，显示生命与护盾占快照顶层 `maxHp`（生效的最大生命，含效果修饰）的比例。`hpBar` 为 `false` 的单位不显示。`stage.hud.bar(unitId)` 返回正在显示的比例，没有头顶条时返回 `null`。

## 视图系统

每帧的系统顺序固定为 `MISSION_VIEW_SYSTEM_ORDER`：

```ts
const MISSION_VIEW_SYSTEM_ORDER = ["ingest", "lifecycle", "position", "facing", "skeleton", "hud", "effect", "audio", "cull", "release"]
```

系统以 id 注册，注册的先后不影响运行顺序。`effect` 与 `cull` 目前没有注册的系统。

## 骨骼端口

演员只经骨骼端口使用骨骼，换运行时只换端口的实现。

```ts
interface MissionSkeletonRuntime {
  load(source: MissionSkeletonSource): MissionSkeletonData
  create(data: MissionSkeletonData): MissionSkeletonInstance
  dispose(data: MissionSkeletonData): void
}

interface MissionSkeletonInstance {
  readonly data: MissionSkeletonData
  readonly object3d: Object3D
  play(track: number, animation: string, loop: boolean): void
  queue(track: number, animation: string, loop: boolean, delay?: number): void
  clear(track: number): void
  update(deltaSeconds: number): void
  onEvent(listener: (event: MissionSkeletonEvent) => void): () => void
  bounds(): MissionSkeletonBounds
  setTint(color: number): void
  dispose(): void
}
```

默认实现 `createMissionSkeletonRuntime({ scale })` 读取 Spine 3.8 的二进制或 JSON 骨骼。`scale` 是每个骨骼单位（像素）对应的场景单位，缺省 0.01。

- 图集：`parseMissionAtlas` 读取 `.atlas` 文本，区域是普通对象（`u`、`v`、`u2`、`v2`、`rotate`、尺寸、偏移、原始尺寸与页）。页贴图是宿主给的 Three 纹理，按 Three 的默认 `flipY` 上传。
- 网格：每个实例一份 `BufferGeometry`，每帧按插槽的绘制顺序写入区域附件与网格附件的世界顶点、贴图坐标与颜色，按页与混合模式（normal、additive、multiply、screen）分组绘制。
- 事件：`event` 是动画里的关键帧事件，`complete` 是一轮播完，`end` 是离开轨道。
- `createMissionSkeletonLoader(runtime, fetch)` 是资源端口的 `spine` 加载函数：取骨骼、图集与页，按文件名把图集页对上资源条目的页文件。页贴图存的是颜色，读作 sRGB。

- 裁剪：裁剪附件的多边形用模板缓冲实现。多边形以扇形三角形翻转模板位画入，之后到 `endSlot` 为止的附件只在模板位为 1 处绘制，结束时再翻转一次还原。凹多边形同样适用。渲染器需要模板缓冲，地面自动创建的 WebGL 渲染器带有模板缓冲。

## 依赖

默认实现使用 `@pixi-spine/runtime-3.8`、`@pixi-spine/base`（4.0.6，Spine Runtimes License）与它们的对等依赖 `@pixi/core`、`@pixi/display`、`@pixi/graphics`、`@pixi/mesh`、`@pixi/mesh-extras`、`@pixi/sprite`（7.4.3）。资源是 Spine 3.8，官方的 Three 运行时只读 4.x，所以借用 pixi-spine 的 3.8 运行时计算骨骼与动画。只用 `SkeletonBinary`、`SkeletonJson`、`Skeleton`、`AnimationState`、`AnimationStateData` 与各附件的顶点计算，不创建 Pixi 渲染器、显示对象或纹理。`@pixi/core` 导入时会注册全局扩展，这是已知的代价。

`test/dependency.spec.ts` 检查只有 `actor/skeleton/` 引用 `@pixi/*` 与 `@pixi-spine/*`，且不取用 Pixi 的渲染器、显示对象与纹理。
