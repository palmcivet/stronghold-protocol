---
title: 演员
description: 快照里的每个单位对应一个演员；表现数据决定它的模型、缩放与头顶条，骨骼端口负责动画与绘制。
---

# 演员

舞台为快照中的每个单位建立一个**演员**。演员只读快照的顶层字段（位置、高度、朝向、`downed`、生命、生效的最大生命 `maxHp`、护盾）与组件视图（如 `attack:stand`），不推断玩法。模型、缩放、镜像这些纯表现的数据由宿主通过 `set-appearances` 给出。

```ts
import type {
  MissionAppearance,
  MissionBoard,
} from "arknights-mission-renderer"

const guard: MissionAppearance = {
  spine: "spine:enemy/slime",
  roles: {
    idle: "Idle",
    deploy: "Start",
    attack: { begin: null, loop: "Attack", end: null },
    attackDown: null,
    skill: null,
    die: "Die",
    move: { begin: null, loop: "Move", end: null },
    stun: null,
  },
  scale: 1,
  scaleY: 1,
  mirrorX: false,
  offset: { x: 0, y: 0, z: 0 },
}

export function dress(stage: MissionBoard): void {
  stage.dispatch({ type: "set-appearances", appearances: { guard } })
}
```

## 表现数据

`MissionAppearance` 的字段：

- `spine`：骨骼的资源键
- `roles`：动画角色表，把待机、部署、攻击、技能、倒下、移动、眩晕映射到骨骼里的动画名；没有的写 `null`
- `scale`：模型缩放；`scaleY`：在 `scale` 之上的纵向缩放
- `mirrorX`：单位朝右时模型朝左
- `offset`：偏移，单位是格；x 沿列、y 沿行、z 向上
- `tint`：可选，`0xRRGGBB`，乘进模型颜色
- `hpBar`：可选，缺省 `true`

`set-appearances` 按单位 id 合并，后给的覆盖先给的。

## 生命周期

- 单位第一次出现在快照中：从对象池按单位种类取出根节点；有表现数据时经资源端口申请骨骼并创建实例
- `deploy` 事件：播部署动画，之后回到待机
- `attack` 事件：播攻击动画，之后回到待机
- 位置在两帧之间变化：播移动动画
- `downed` 事件，或快照 `downed` 为 `true`：播倒下动画并停在最后一帧，头顶条隐藏
- 快照 `downed` 回到 `false`：回到站立
- `removed` 事件，或单位不再出现在快照中：在 `MISSION_ACTOR_FADE_SECONDS`（0.6 秒）内淡出，之后释放骨骼实例与资源句柄，根节点归还对象池

位置与朝向：

- 根节点在场景坐标中（x 为列，y 为高度，z 为负的行），位置是单位位置加 `offset`
- 有表面函数时站在它返回的高度上，否则用快照的 `height`；舞台有地面时用地面的 `surfaceHeight`，覆盖 `actors.surface`
- 朝向取快照的 `facing`：朝左时水平翻转，`mirrorX` 再翻转一次
- 缩放为 `scale`，纵向再乘 `scaleY`

## 头顶条

头顶条画在站立的演员上方，显示生命与护盾占 `maxHp` 的比例。

- `hpBar` 为 `false` 的单位不显示
- `stage.hud.bar(unitId)` 返回正在显示的比例，没有头顶条时为 `null`

另有三种读数，`stage.hud.readouts(unitId)` 返回正在显示的值：

- 弹匣 `magazine`：弹药技能持续时的剩余弹药，读快照 `skills` 的 `ammo`，画成生命条下方的黄色条；敌人不显示
- 计数 `pips`：一排小方块，剩余的亮，用掉的暗
- 负生命池 `negative`：0 到 1，画成盖在生命条上的红色条

计数与负生命池的读法由使用方登记在读数表里，经 `options.hud` 传给舞台：

```ts
import {
  createMissionHudReaders,
  createMissionStage,
  type MissionHudCount,
} from "arknights-mission-renderer"

const hud = createMissionHudReaders()
hud.register({
  id: "my-mod:stock",
  readout: "pips",
  read: (unit) =>
    (unit.components["my-mod:stock"] as MissionHudCount | undefined) ?? null,
})
const stage = createMissionStage(null, { hud })
console.log(stage.hud.readouts("guard"))
```

- 读数表按命名空间 id 登记，可以 `replace`，舞台创建时封存
- 同一种读数有多个读法时，按登记顺序取第一个读到值的
- `hudReadoutsOf(unit, readers)` 单独计算一个单位的读数

## 替身

**替身**（impostor）把骨骼画进共享的渲染目标页，再用一块贴图显示，适合拥挤的场面和带裁剪附件的骨骼。`createMissionImpostorAtlas` 创建替身图集。

- 每页按 `cell`（缺省 256 像素）切成等大的格子，一个槽占一格
- 主页缺省 2048 像素、最多 3 页；带裁剪的骨骼用单独的裁剪页，缺省 1024 像素、最多 2 页；页按需新建
- 所有页都满或尺寸超过一格时，`alloc` 返回 `null`，演员直接绘制骨骼
- `draw` 把骨骼排进队列；`flush` 每帧一次，在主渲染之前以透明背景画进各自的槽，之后恢复原来的渲染目标与清屏透明度
- `impostorDue(refresh)` 决定这一帧是否重画：
  - 按演员在本帧更新序里的位置，把重画均匀分散到间隔内
  - 图像过期、缩放变化超过 12 % 或间隔不大于 1 时立即重画
  - 最迟两个间隔重画一次；保持的姿态不重画

## 剔除

舞台的 `cull` 系统按地面相机的视锥剔除：

- 演员用球测试：以位置为心，半径 1.5 格乘外观缩放
- 特效对象用包围盒测试
- 视锥外的演员 `culled` 为真、根节点不可见，`skeleton` 系统不推进它的动画（切换动作照常记下），回到视锥内时恢复
- 特效对象只隐藏，生命周期照常推进

## 骨骼端口

演员只经**骨骼端口** `MissionSkeletonRuntime` 使用骨骼：`load` 读入骨骼数据，`create` 建实例，`dispose` 释放数据。换运行时只换端口的实现。

```ts
import type { AssetResolver } from "arknights-assets-catalog"
import {
  createMissionResourcePort,
  createMissionSkeletonLoader,
  createMissionSkeletonRuntime,
  createMissionStage,
} from "arknights-mission-renderer"
import { TextureLoader } from "three"

export function stageWithModels(resolver: AssetResolver) {
  const textures = new TextureLoader()
  const skeleton = createMissionSkeletonRuntime({ scale: 0.01 })
  const resources = createMissionResourcePort({
    resolver,
    image: (url) => textures.loadAsync(url),
    spine: createMissionSkeletonLoader(skeleton, {
      bytes: async (url) =>
        new Uint8Array(await (await fetch(url)).arrayBuffer()),
      text: async (url) => (await fetch(url)).text(),
      texture: (url) => textures.loadAsync(url),
    }),
    model: async (url) => (await fetch(url)).text(),
    json: async (url) => (await fetch(url)).json(),
  })
  return createMissionStage(null, { actors: { skeleton, resources } })
}
```

默认实现 `createMissionSkeletonRuntime({ scale })` 读取 Spine 3.8 的二进制或 JSON 骨骼。`scale` 是每个骨骼单位（像素）对应的场景单位，缺省 0.01。

- 加载：`createMissionSkeletonLoader(runtime, fetch)` 是资源端口的 `spine` 加载函数；取骨骼、图集与页，按文件名把图集页对上条目的页文件；页贴图存的是颜色，读作 sRGB
- 图集：`parseMissionAtlas` 读 `.atlas` 文本；页贴图是宿主给的 Three 纹理，按默认的 `flipY` 上传
- 网格：每个实例一份 `BufferGeometry`，每帧按插槽的绘制顺序写入顶点、贴图坐标与颜色，按页与混合模式（normal、additive、multiply、screen）分组绘制
- 事件：`event` 是动画里的关键帧事件，`complete` 是一轮播完，`end` 是离开轨道
- 裁剪：裁剪附件用模板缓冲实现，凹多边形同样适用；渲染器需要模板缓冲，地面自动创建的渲染器带有模板缓冲。机制见 [架构设计](./10-architecture.md#骨骼运行时)
