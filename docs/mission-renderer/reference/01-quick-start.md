---
title: 快速开始
description: 建立资源端口与骨骼运行时，创建带三维地面的舞台，把画布挂进页面，逐帧推入快照并拾取。
---

# 快速开始

这一页从零开始：按资源键加载地面贴图与 Spine 模型，创建舞台，把画布挂进页面，再逐帧推入战斗数据。

## 安装

```bash
npm install arknights-mission-renderer three
```

`three` 是 peer 依赖，由宿主安装。

## 1. 建立资源端口

资源端口按资源键加载文件。键与地址来自 [arknights-assets-catalog](../../assets-catalog/index.md) 的解析器；加载函数由宿主提供。

```ts
import { createAssetResolver, isPackManifest } from "arknights-assets-catalog"
import type { BattleEvent, BattleSnapshot } from "arknights-mission-core"
import {
  createMissionResourcePort,
  createMissionSkeletonLoader,
  createMissionSkeletonRuntime,
  createMissionStage,
  type MissionMap,
} from "arknights-mission-renderer"
import { TextureLoader } from "three"

const url = "https://cdn.example/packs/base/manifest.json"
const manifest: unknown = await (await fetch(url)).json()
if (!isPackManifest(manifest)) {
  throw new Error(`not a pack manifest: ${url}`)
}
const resolver = createAssetResolver([{ manifest, url }])

const textures = new TextureLoader()
const skeleton = createMissionSkeletonRuntime()
const resources = createMissionResourcePort({
  resolver,
  image: (file) => textures.loadAsync(file),
  spine: createMissionSkeletonLoader(skeleton, {
    bytes: async (file) =>
      new Uint8Array(await (await fetch(file)).arrayBuffer()),
    text: async (file) => (await fetch(file)).text(),
    texture: (file) => textures.loadAsync(file),
  }),
  model: async (file) => (await fetch(file)).text(),
  json: async (file) => (await fetch(file)).json(),
})
```

- 颜色空间、mipmap 与各向异性由端口按资源种类设置，见 [纹理策略](./05-port.md#纹理策略)
- `model` 返回 OBJ 文本即可，地面会解析它

## 2. 创建舞台

```ts
const map: MissionMap = {
  cols: 2,
  rows: 1,
  tiles: [
    { x: 0, y: 0, height: 0, deployable: true, walkableBy: ["ground"] },
    { x: 1, y: 0, height: 0, deployable: true, walkableBy: ["ground"] },
  ],
}

const stage = createMissionStage(map, {
  terrain: {
    resources,
    pack: { images: { diffuse: "texture:board/stone_D" } },
    pixelRatio: window.devicePixelRatio,
  },
  actors: { skeleton, resources },
  onAudioCue: (cue) => console.log(cue.type),
})
await stage.terrain?.ready
```

- `terrain` 给出地形资源包，只有 `images.diffuse` 是必需的，见 [地面](./04-ground.md#地形资源包)
- `actors` 给出骨骼运行时与资源端口，单位才有模型，见 [演员](./06-actor.md)

## 3. 挂上画布

```ts
const host = document.querySelector<HTMLElement>("#stage")
if (!host) {
  throw new Error("missing #stage")
}
host.style.position = "relative"

const resize = (): void => {
  stage.resize(host.clientWidth, host.clientHeight)
}
resize()
new ResizeObserver(resize).observe(host)
```

画布由宿主挂进容器；容器要是定位的祖先，画布的坐标才与视口对齐。见 [画布](./02-stage.md#画布)。

## 4. 逐帧推进

```ts
let last = performance.now()
function frame(now: number): void {
  stage.update(Math.min(0.1, (now - last) / 1000))
  last = now
  const canvas = stage.canvas
  if (canvas instanceof HTMLCanvasElement && canvas.parentElement !== host) {
    host?.append(canvas)
  }
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

export function onBattle(
  snapshot: BattleSnapshot,
  events: readonly BattleEvent[],
): void {
  stage.dispatch({ type: "push-snapshot", snapshot })
  for (const event of events) {
    stage.dispatch({ type: "push-event", event })
  }
}
```

- `update` 每帧调用一次，参数是真实秒数
- 推入的事件在下一次 `update` 释放：演员播动画、特效开始、发出音效线索

## 5. 拾取

```ts
host.addEventListener("pointerup", (event) => {
  const bounds = host.getBoundingClientRect()
  const hit = stage.pick(
    event.clientX - bounds.left,
    event.clientY - bounds.top,
  )
  if (hit.type === "unit") {
    console.log(hit.unitId)
  }
})
```

拾取的坐标相对容器左上角，规则见 [拾取](./02-stage.md#拾取)。

## 下一步

- 舞台的全部命令：[舞台](./02-stage.md)
- 逐帧模拟的平滑播放：[本地喂数](./03-feed.md)
- 单位的模型与动画：[演员](./06-actor.md)
