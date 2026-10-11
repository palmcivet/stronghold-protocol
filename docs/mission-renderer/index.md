---
title: 作战画面
description: arknights-mission-renderer 把战斗快照和事件画成三维战场，并提供拾取、本地逐帧喂数、资源端口和音效线索。
---

# 作战画面

`arknights-mission-renderer` 把公开的战斗快照和事件画成战场。它不判断命中、不计算伤害、不决定移动，这些由 `arknights-mission-core` 完成。同一份快照和事件序列，换一套画法不改变战斗结果。

画面用 Three.js 绘制三维地面与单位。单位的 Spine 骨骼用 pixi-spine 的 3.8 运行时计算，只取骨骼与动画部分，由自建的 Three 网格绘制，不创建 Pixi 渲染器或显示对象。没有 WebGL 时地面隐藏，舞台本身仍接收快照、事件，并发出音效线索。

## 组成

```text
mission-renderer/
  contract/       视图命令、拾取结果、音效线索、地图与相机类型
  port/           资源端口：向资源目录申请图片、Spine、模型的句柄；骨骼运行时端口
  runtime/
    stage/        舞台入口：组装与命令分发
    feed/         快照缓冲与本地喂数
    camera/       投影与相机
    cull/         视口剔除
    registry/     命名空间 id 的封存注册表
  ground/         三维地面：场景、材质、布局、地形资源包、格子尺寸
  actor/
    entity/       演员实体、视图组件与对象池
    skeleton/     骨骼端口的默认实现：Spine 3.8 运行时与 Three 网格
    hud/          头顶条与读数
    impostor/     替身图集
  effect/         特效表、线索绑定与特效层
  pointer/        拾取
  audio/          事件到音效线索
```

`contract/` 的类型是对外的输入输出。`runtime/stage/` 的 `createMissionStage` 把它们串起来。`port/` 是唯一向外要资源的地方。

每个顶层目录有一个路径别名（`#contract/*.js`、`#port/*.js`、`#runtime/*.js`、`#ground/*.js`、`#actor/*.js`、`#pointer/*.js`、`#audio/*.js`、`#effect/*.js`），包内用别名引用，不写相对路径。

## 快速开始

```ts
import type { BattleEvent, BattleSnapshot } from "arknights-mission-core"
import { createMissionStage, createMissionResourcePort } from "arknights-mission-renderer"

const stage = createMissionStage(map, {
  onAudioCue: (cue) => playCue(cue),
  terrain: {
    resources: createMissionResourcePort({
      resolver,
      image: (url) => textureLoader.loadAsync(url), // 颜色空间、mipmap 与各向异性由端口按资源种类设置
      spine: (source) => loadSpine(source),
      model: (url) => loadModel(url),
      json: async (url) => (await fetch(url)).json(),
    }),
    pack: { images: { diffuse: "texture:map/autochess/TX_autochessi_D" } },
  },
})

const host = document.querySelector<HTMLElement>("#stage")!
const resize = (): void => stage.resize(host.clientWidth, host.clientHeight)
resize()
new ResizeObserver(resize).observe(host)

function onBattle(snapshot: BattleSnapshot, events: readonly BattleEvent[]): void {
  stage.dispatch({ type: "push-snapshot", snapshot })
  for (const event of events) stage.dispatch({ type: "push-event", event })
}

let last = performance.now()
function frame(now: number): void {
  stage.update(Math.min(0.1, (now - last) / 1000))
  last = now
  const canvas = stage.canvas
  if (canvas instanceof HTMLCanvasElement && canvas.parentElement !== host) host.append(canvas)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

host.addEventListener("pointerup", (event) => {
  const bounds = host.getBoundingClientRect()
  const hit = stage.pick(event.clientX - bounds.left, event.clientY - bounds.top)
  if (hit.type === "unit") console.log(hit.unitId)
})
```

`stage.dispatch` 每次推入一个命令，`stage.update` 每帧调用一次。`resize` 把舞台放进宿主给的视口。画布由宿主挂到容器中，见 [舞台](./02-stage.md)。

## 依赖

| 包 | 用途 |
| --- | --- |
| `arknights-mission-core` | `BattleSnapshot`、`BattleEvent`、`UnitSnapshot`、`TileSpec` 等类型，`TICK` |
| `arknights-assets-catalog` | `AssetKey`、`AssetResolver` 类型，`spineSource` 与 Spine 缓存 |
| `@pixi-spine/runtime-3.8`、`@pixi-spine/base` | Spine 3.8 骨骼数据与动画状态，只用在 `actor/skeleton` 里，不用 Pixi 画布 |
| `@pixi/core` 等 `@pixi/*` | 上面两个包要求的依赖，固定在 7.4.3 |
| `three` | 三维地面，作为 peer 依赖由宿主安装 |

## 导出

`mission-renderer` 的入口导出以下名字。公开名字统一带 `Mission` 前缀（常量是 `MISSION_`），并且就是包内定义的名字，入口不用 `as` 改名。不导出的部分保留自然的领域名（地面内部用 `Terrain*`）。只描述动作的函数（`calculateBoardTransform`、`audioCueFor`、`effectCueFor`）不加前缀。

- 舞台：`createMissionStage`，以及类型 `MissionBoard`、`MissionStageOptions`
- 视图系统：`MISSION_VIEW_SYSTEM_ORDER`，以及类型 `MissionViewSystemId`
- 地面：`createMissionGround`、`MISSION_GROUND_GATE_NODES`、`MISSION_GROUND_HIGHLIGHT`、`MISSION_GROUND_IMAGE_SLOTS`、`MISSION_GROUND_MESH_SLOTS`，以及类型 `MissionGround`、`MissionGroundOptions`、`MissionGroundMode`、`MissionGroundPack`、`MissionGroundImageSlot`
- 资源：`createMissionResourcePort`、`MISSION_TEXTURE_POLICY`，以及类型 `MissionResourcePort`、`MissionResourceLoaders`、`MissionAssetKind`
- 演员：`MISSION_ACTOR_FADE_SECONDS`、`MISSION_HUD_BAR`，以及类型 `MissionActor`、`MissionActorPhase`、`MissionActorRole`、`MissionActorWorld`、`MissionActorWorldOptions`、`MissionHudLayer`
- 骨骼：`createMissionSkeletonRuntime`、`createMissionSkeletonLoader`、`parseMissionAtlas`，以及类型 `MissionSkeletonRuntime`、`MissionSkeletonData`、`MissionSkeletonInstance`、`MissionSkeletonEvent`、`MissionSkeletonBounds`、`MissionSkeletonSource`、`MissionSkeletonAtlas`、`MissionSkeletonFetch`、`MissionSkeletonRuntimeOptions`、`MissionAtlasPage`、`MissionAtlasRegion`
- 相机：`calculateBoardTransform`，以及类型 `MissionBoardTransform`
- 喂数：`createMissionFeed`，以及类型 `MissionFeed`、`MissionFeedOptions`、`MissionFeedSample`
- 音效：`audioCueFor`、`effectCueFor`，以及类型 `MissionAudioCue`、`MissionAudioCueType`、`MissionAudioCueOptions`、`EffectAudioFor`
- 线索：`cueFor`、`MISSION_EVENT_BINDINGS`、`createMissionCueBindings`、`sealMissionCues`，以及类型 `MissionCue`、`MissionCueBase`、`MissionCueBinding`、`MissionCueBindings`、`MissionCueData`、`MissionCueKey`、`MissionCueKind`、`MissionEventBindings`、`MissionEventCueKey`、`MissionKindCueKey`
- 特效：`createMissionEffectTable`、`MISSION_EFFECT_KINDS`、`createPulseKind`，以及类型 `MissionEffectTable`、`MissionEffectKind`、`MissionEffectKindId`、`MissionEffectContext`、`MissionEffectLayer`、`MissionPulseOptions`
- 头顶条读数：`createMissionHudReaders`、`hudReadoutsOf`，以及类型 `MissionHudReader`、`MissionHudReaderTable`、`MissionHudReadouts`、`MissionHudCount`
- 替身：`createMissionImpostorAtlas`、`impostorDue`，以及类型 `MissionImpostorAtlas`、`MissionImpostorAtlasOptions`、`MissionImpostorRenderer`、`MissionImpostorRefresh`、`MissionImpostorSlot`
- 注册表：`isNamespacedId`，以及类型 `MissionNamespacedId`
- 表现数据：`MissionAppearance`、`MissionAppearances`、`MissionAnimRoles`、`MissionAnimClip`、`MissionSkillClip`
- 契约：`MissionMap`、`MissionCamera`、`MissionView`、`MissionStage`、`MissionStageCommand`、`MissionUpdateMode`、`MissionPointerHit`、`MissionPointerEvent`、`MissionPointerPhase`
