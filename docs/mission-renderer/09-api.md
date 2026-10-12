---
title: API 参考
description: arknights-mission-renderer 公开函数的签名，按模块分组。
---

# API 参考

下面按模块列出公开函数与类型的签名，类型的字段见各页说明。

## 舞台

```ts
import type {
  MissionBoard,
  MissionBoardTransform,
  MissionCamera,
  MissionMap,
  MissionStageOptions,
} from "arknights-mission-renderer"
import * as mod from "arknights-mission-renderer"

export declare function createMissionStage(
  initialMap?: MissionMap | null,
  options?: MissionStageOptions,
): MissionBoard

export declare function calculateBoardTransform(
  cols: number,
  rows: number,
  camera: MissionCamera | null,
  tileSize: number,
  viewportWidth: number,
  viewportHeight: number,
): MissionBoardTransform | null

// ---cut-after---
mod.createMissionStage satisfies typeof createMissionStage
mod.calculateBoardTransform satisfies typeof calculateBoardTransform
```

## 喂数

```ts
import type {
  MissionFeed,
  MissionFeedOptions,
} from "arknights-mission-renderer"
import * as mod from "arknights-mission-renderer"

export declare function createMissionFeed(
  options?: MissionFeedOptions,
): MissionFeed

// ---cut-after---
mod.createMissionFeed satisfies typeof createMissionFeed
```

## 地面

```ts
import type {
  MissionGround,
  MissionGroundOptions,
} from "arknights-mission-renderer"
import * as mod from "arknights-mission-renderer"

export declare function createMissionGround(
  options?: MissionGroundOptions,
): MissionGround

// ---cut-after---
mod.createMissionGround satisfies typeof createMissionGround
```

## 资源端口

```ts
import type {
  MissionResourceLoaders,
  MissionResourcePort,
} from "arknights-mission-renderer"
import * as mod from "arknights-mission-renderer"

export declare function createMissionResourcePort<
  TImage = unknown,
  TSpine = unknown,
  TModel = unknown,
  TJson = unknown,
>(
  options: MissionResourceLoaders<TImage, TSpine, TModel, TJson>,
): MissionResourcePort<TImage, TSpine, TModel, TJson>

// ---cut-after---
mod.createMissionResourcePort satisfies typeof createMissionResourcePort
```

## 演员

```ts
import type { SpineSource } from "arknights-assets-catalog"
import type { UnitSnapshot } from "arknights-mission-core"
import type {
  MissionHudReader,
  MissionHudReaderTable,
  MissionHudReadouts,
  MissionImpostorAtlas,
  MissionImpostorAtlasOptions,
  MissionImpostorRefresh,
  MissionSkeletonAtlas,
  MissionSkeletonData,
  MissionSkeletonFetch,
  MissionSkeletonRuntime,
  MissionSkeletonRuntimeOptions,
} from "arknights-mission-renderer"
import * as mod from "arknights-mission-renderer"

export declare function createMissionSkeletonRuntime(
  options?: MissionSkeletonRuntimeOptions,
): MissionSkeletonRuntime

export declare function createMissionSkeletonLoader(
  runtime: MissionSkeletonRuntime,
  fetch: MissionSkeletonFetch,
): (source: SpineSource) => Promise<MissionSkeletonData>

export declare function parseMissionAtlas(text: string): MissionSkeletonAtlas

export declare function createMissionHudReaders(): MissionHudReaderTable

export declare function hudReadoutsOf(
  unit: UnitSnapshot,
  readers?: readonly MissionHudReader[],
): MissionHudReadouts

export declare function createMissionImpostorAtlas(
  options: MissionImpostorAtlasOptions,
): MissionImpostorAtlas

export declare function impostorDue(refresh: MissionImpostorRefresh): boolean

// ---cut-after---
mod.createMissionSkeletonRuntime satisfies typeof createMissionSkeletonRuntime
mod.createMissionSkeletonLoader satisfies typeof createMissionSkeletonLoader
mod.parseMissionAtlas satisfies typeof parseMissionAtlas
mod.createMissionHudReaders satisfies typeof createMissionHudReaders
mod.hudReadoutsOf satisfies typeof hudReadoutsOf
mod.createMissionImpostorAtlas satisfies typeof createMissionImpostorAtlas
mod.impostorDue satisfies typeof impostorDue
```

## 特效

```ts
import type { BattleEvent } from "arknights-mission-core"
import type {
  MissionCue,
  MissionCueBindings,
  MissionCueKey,
  MissionEffectKind,
  MissionEffectTable,
  MissionPulseOptions,
  MissionNamespacedId,
} from "arknights-mission-renderer"
import * as mod from "arknights-mission-renderer"

export declare function cueFor(event: BattleEvent): MissionCue

export declare function createMissionCueBindings(): MissionCueBindings

export declare function createMissionEffectTable(): MissionEffectTable

export declare function sealMissionCues(
  table: MissionEffectTable,
  bindings: MissionCueBindings,
): void

export declare function isNamespacedId(id: string): id is MissionNamespacedId

// ---cut-after---
mod.cueFor satisfies typeof cueFor
mod.createMissionCueBindings satisfies typeof createMissionCueBindings
mod.createMissionEffectTable satisfies typeof createMissionEffectTable
mod.sealMissionCues satisfies typeof sealMissionCues
mod.isNamespacedId satisfies typeof isNamespacedId
mod.createPulseKind satisfies <K extends MissionCueKey>(
  options: MissionPulseOptions<K>,
) => MissionEffectKind<K, unknown>
```

`createPulseKind` 返回的实例类型是内部类型，上面只检查到 `unknown`。

## 音效线索

```ts
import type { BattleEvent, UnitSnapshot } from "arknights-mission-core"
import type {
  MissionAudioCue,
  MissionAudioCueOptions,
} from "arknights-mission-renderer"
import * as mod from "arknights-mission-renderer"

export declare function audioCueFor(
  event: BattleEvent,
  options?: MissionAudioCueOptions,
): MissionAudioCue | null

export declare function effectCueFor(
  event: BattleEvent,
  units: readonly UnitSnapshot[],
  options?: MissionAudioCueOptions,
): MissionAudioCue | null

// ---cut-after---
mod.audioCueFor satisfies typeof audioCueFor
mod.effectCueFor satisfies typeof effectCueFor
```

## 常量

| 常量 | 说明 |
| --- | --- |
| `MISSION_ACTOR_FADE_SECONDS` | 演员淡出时长，0.6 秒 |
| `MISSION_HUD_BAR` | 头顶条的宽、高与抬升高度，单位是格 |
| `MISSION_TEXTURE_POLICY` | 按种类的纹理策略 |
| `MISSION_EVENT_BINDINGS` | 核心事件（`CORE_EVENT_TYPES` 除裸 `cue`）的默认线索绑定 |
| `MISSION_EFFECT_KINDS` | 引擎的特效种类 |
| `MISSION_GROUND_IMAGE_SLOTS` | 地形资源包的图片槽 |
| `MISSION_GROUND_MESH_SLOTS` | 地形资源包的模型槽 |
| `MISSION_GROUND_GATE_NODES` | 出入口模型的节点名 |
| `MISSION_GROUND_HIGHLIGHT` | 地块高亮的颜色、透明度与大小 |
| `MISSION_VIEW_SYSTEM_ORDER` | 每帧视图系统的顺序 |
