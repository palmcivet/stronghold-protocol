---
title: 作战画面
description: arknights-mission-renderer 把战斗快照和事件画成三维战场，并提供拾取、本地逐帧喂数、资源端口和音效线索。
---

# 作战画面

`arknights-mission-renderer` 把公开的战斗快照和事件画成战场。它不判断命中、不计算伤害、不决定移动，这些由 `arknights-mission-core` 完成。同一份快照和事件序列，换一套画法不改变战斗结果。

画面只用 Three.js 绘制三维地面。没有 WebGL 时地面隐藏，舞台本身仍接收快照、事件，并发出音效线索。

## 组成

```text
mission-renderer/
  contract/       视图命令、拾取结果、音效线索、地图与相机类型
  port/           资源端口：向资源目录申请图片、Spine、模型的句柄
  stage/          舞台入口，以及它使用的喂数、音效、拾取、投影
    ground/
      terrain/    三维地面：场景、材质、布局、地形资源包
```

`contract/` 的类型是对外的输入输出。`stage/` 的 `createMissionStage` 把它们串起来。`port/` 是唯一向外要资源的地方。

## 快速开始

```ts
import type { BattleEvent, BattleSnapshot } from "arknights-mission-core"
import { createMissionStage, createRendererResourcePort } from "arknights-mission-renderer"

const stage = createMissionStage(map, {
  onAudioCue: (cue) => playCue(cue),
  terrain: {
    resources: createRendererResourcePort({
      resolver,
      image: (url) => textureLoader.loadAsync(url),
      spine: (source) => loadSpine(source),
      model: (url) => loadModel(url),
      json: async (url) => (await fetch(url)).json(),
    }),
    pack: { images: { D: "texture:map/autochess/TX_autochessi_D" } },
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
| `three` | 三维地面，作为 peer 依赖由宿主安装 |

## 导出

`mission-renderer` 的入口导出以下名字：

- 舞台：`createMissionStage`，以及类型 `MissionBoard`、`MissionStageOptions`
- 地面：`createTerrainStage`、`TERRAIN_GATE_NODES`、`TERRAIN_IMAGE_SLOTS`、`TERRAIN_MESH_SLOTS`，以及类型 `TerrainMode`、`TerrainPackRequest`
- 资源：`createRendererResourcePort`，以及类型 `RendererResourcePort`、`RendererResourceLoaders`
- 喂数：`createLocalFeed`，以及类型 `LocalFeed`、`LocalFeedOptions`、`FeedSample`
- 音效：`audioCueFor`、`effectCueFor`，以及类型 `MissionAudioCue`
- 契约：`MissionMap`、`MissionCamera`、`MissionView`、`MissionStage`、`MissionStageCommand`、`MissionUpdateMode`、`MissionPointerHit`
