---
title: API 参考
description: arknights-mission-renderer 公开函数的签名，按模块分组。
---

# API 参考

下面按模块列出公开函数与类型的签名，类型的字段见各页说明。

## 舞台

```ts
import type { BattleSnapshot, TileCoord } from "arknights-mission-core"
import type {
  MissionBlowerFacing,
  MissionBoard,
  MissionBoardTransform,
  MissionCamera,
  MissionMap,
  MissionStageOptions,
  MissionTileRect,
} from "arknights-mission-renderer"
import * as mod from "arknights-mission-renderer"

export declare function createMissionStage(
  initialMap?: MissionMap | null,
  options?: MissionStageOptions,
): MissionBoard

export declare function blowerFacings(
  snapshot: BattleSnapshot,
): readonly MissionBlowerFacing[]

export declare function fieldOf(
  map: MissionMap | null,
  camera: MissionCamera | null,
): MissionTileRect | null

export declare function deviceTiles(
  snapshot: BattleSnapshot,
): readonly TileCoord[]

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
mod.blowerFacings satisfies typeof blowerFacings
mod.deviceTiles satisfies typeof deviceTiles
mod.fieldOf satisfies typeof fieldOf
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
import type { PerspectiveCamera } from "three"
import type {
  MissionCamera,
  MissionGround,
  MissionGroundOptions,
  MissionProjection,
  MissionProjectionOptions,
  MissionScreenPoint,
  MissionMap,
  MissionTileRect,
  WebGLProbeDocument,
} from "arknights-mission-renderer"
import * as mod from "arknights-mission-renderer"

export declare function clipMapToAreas(
  map: MissionMap,
  areas: readonly MissionTileRect[] | null,
): MissionMap

export declare function webgl2Available(
  allowSlow?: boolean,
  doc?: WebGLProbeDocument | undefined,
): boolean

export declare function createMissionGround(
  options?: MissionGroundOptions,
): MissionGround

export declare function frameProjection(
  cols: number,
  rows: number,
  camera: MissionCamera | null,
  tileSize: number,
  options?: MissionProjectionOptions,
): MissionProjection | null

export declare function projectPoint(
  projection: MissionProjection,
  x: number,
  y: number,
  z: number,
): MissionScreenPoint | null

export declare function unprojectPoint(
  projection: MissionProjection,
  screenX: number,
  screenY: number,
  z: number,
): { readonly x: number; readonly y: number } | null

export declare function syncPerspectiveCamera(
  camera: PerspectiveCamera,
  projection: MissionProjection,
): void

// ---cut-after---
mod.createMissionGround satisfies typeof createMissionGround
mod.clipMapToAreas satisfies typeof clipMapToAreas
mod.webgl2Available satisfies typeof webgl2Available
mod.frameProjection satisfies typeof frameProjection
mod.projectPoint satisfies typeof projectPoint
mod.unprojectPoint satisfies typeof unprojectPoint
mod.syncPerspectiveCamera satisfies typeof syncPerspectiveCamera
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
import type { Texture } from "three"
import type {
  MissionHudFrame,
  MissionHudIcon,
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
  MissionAppearance,
} from "arknights-mission-renderer"
import * as mod from "arknights-mission-renderer"

export declare function formOf(
  appearance: MissionAppearance,
  unit: UnitSnapshot,
): number

export declare function createMissionSkeletonRuntime(
  options?: MissionSkeletonRuntimeOptions,
): MissionSkeletonRuntime

export declare function createMissionSkeletonLoader(
  runtime: MissionSkeletonRuntime,
  fetch: MissionSkeletonFetch,
): (source: SpineSource) => Promise<MissionSkeletonData>

export declare function parseMissionAtlas(text: string): MissionSkeletonAtlas

export declare function createMissionHudReaders(): MissionHudReaderTable

export declare const MISSION_HUD_ICONS: readonly MissionHudIcon[]

export declare const MISSION_HUD_FRAMES: readonly MissionHudFrame[]

export declare function defaultDigitTexture(digit: number): Texture

export declare function hudReadoutsOf(
  unit: UnitSnapshot,
  readers?: readonly MissionHudReader[],
): MissionHudReadouts

export declare function createMissionImpostorAtlas(
  options: MissionImpostorAtlasOptions,
): MissionImpostorAtlas

export declare function impostorDue(refresh: MissionImpostorRefresh): boolean

export declare const IMPOSTOR_RESCALE: number

export interface MissionActorImpostor {
  readonly atlas: MissionImpostorAtlas
  readonly interval?: number
  readonly pixelsPerUnit?: number
}

// ---cut-after---
mod.createMissionSkeletonRuntime satisfies typeof createMissionSkeletonRuntime
mod.formOf satisfies typeof formOf
mod.createMissionSkeletonLoader satisfies typeof createMissionSkeletonLoader
mod.parseMissionAtlas satisfies typeof parseMissionAtlas
mod.createMissionHudReaders satisfies typeof createMissionHudReaders
mod.hudReadoutsOf satisfies typeof hudReadoutsOf
mod.MISSION_HUD_ICONS satisfies typeof MISSION_HUD_ICONS
mod.MISSION_HUD_FRAMES satisfies typeof MISSION_HUD_FRAMES
mod.defaultDigitTexture satisfies typeof defaultDigitTexture
mod.createMissionImpostorAtlas satisfies typeof createMissionImpostorAtlas
mod.impostorDue satisfies typeof impostorDue
mod.IMPOSTOR_RESCALE satisfies typeof IMPOSTOR_RESCALE
;({}) as mod.MissionActorImpostor satisfies MissionActorImpostor
;({}) as MissionActorImpostor satisfies mod.MissionActorImpostor
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
  OfficialFxSpec,
  MissionCueBinding,
  MissionDamageNumberOptions,
  MissionEffectKindId,
  MissionNamespacedId,
  MissionBurstOptions,
  MissionZoneOptions,
  MissionBeamOptions,
  MissionProjectileOptions,
  MissionTilesOptions,
  MissionVeilOptions,
  MissionSnowOptions,
  MissionSlashOptions,
  MissionEffectContext,
  MissionEffectPoint,
  MissionTileRect,
} from "arknights-mission-renderer"
import * as mod from "arknights-mission-renderer"

export declare function actorPoint(
  context: MissionEffectContext,
  unitId: string | undefined,
  lift?: number,
): MissionEffectPoint | undefined

export declare function createBurstKind<K extends MissionCueKey>(
  options: MissionBurstOptions<K>,
): MissionEffectKind<K, unknown>

export declare function createZoneKind<K extends MissionCueKey>(
  options: MissionZoneOptions<K>,
): MissionEffectKind<K, unknown>

export declare function createBeamKind<K extends MissionCueKey>(
  options: MissionBeamOptions<K>,
): MissionEffectKind<K, unknown>

export declare function createProjectileKind(
  options?: MissionProjectileOptions,
): MissionEffectKind<"projectile", unknown>

export declare function createTilesKind<K extends MissionCueKey>(
  options: MissionTilesOptions<K>,
): MissionEffectKind<K, unknown>

export declare function createVeilKind<K extends MissionCueKey>(
  options: MissionVeilOptions<K>,
): MissionEffectKind<K, unknown>

export declare function createSnowKind<K extends MissionCueKey>(
  options: MissionSnowOptions<K>,
): MissionEffectKind<K, unknown>

export declare function createSlashKind<K extends MissionCueKey>(
  options: MissionSlashOptions<K>,
): MissionEffectKind<K, unknown>

export declare function tilesOpacity(
  age: number,
  seconds: number,
  warn: boolean,
): number

export declare function officialTilesAround(
  x: number,
  y: number,
  r: number,
  tiles: unknown,
): (readonly [number, number])[]

export declare function officialWallTiles(
  x: number,
  y: number,
  axis: string,
  field?: MissionTileRect | null,
): (readonly [number, number])[]

export declare function cueFor(event: BattleEvent): MissionCue

export declare function createMissionCueBindings(): MissionCueBindings

export declare function createMissionEffectTable(): MissionEffectTable

export declare function sealMissionCues(
  table: MissionEffectTable,
  bindings: MissionCueBindings,
): void

export declare function isNamespacedId(id: string): id is MissionNamespacedId

export declare function effectsOf(
  binding: MissionCueBinding,
): readonly MissionEffectKindId[]

export declare function installOfficialFx(
  table: MissionEffectTable,
  bindings: MissionCueBindings,
): void

export declare function officialFxEffects(
  kind: string,
): readonly MissionEffectKindId[]

export declare const OFFICIAL_FX: Readonly<Record<string, OfficialFxSpec>>

export declare function createDamageNumberKind(
  options?: MissionDamageNumberOptions,
): MissionEffectKind<"damaged" | "heal" | "dodged", unknown>

// ---cut-after---
mod.effectsOf satisfies typeof effectsOf
mod.installOfficialFx satisfies typeof installOfficialFx
mod.officialFxEffects satisfies typeof officialFxEffects
mod.OFFICIAL_FX satisfies typeof OFFICIAL_FX
mod.createDamageNumberKind satisfies typeof createDamageNumberKind
mod.actorPoint satisfies typeof actorPoint
mod.createBurstKind satisfies typeof createBurstKind
mod.createZoneKind satisfies typeof createZoneKind
mod.createBeamKind satisfies typeof createBeamKind
mod.createProjectileKind satisfies typeof createProjectileKind
mod.createTilesKind satisfies typeof createTilesKind
mod.createVeilKind satisfies typeof createVeilKind
mod.createSnowKind satisfies typeof createSnowKind
mod.createSlashKind satisfies typeof createSlashKind
mod.tilesOpacity satisfies typeof tilesOpacity
mod.officialTilesAround satisfies typeof officialTilesAround
mod.officialWallTiles satisfies typeof officialWallTiles
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

export declare const SKILL_HOLD_LIMIT: number

export interface SkillCueHold {
  pass(
    cue: MissionAudioCue,
    known: (unitId: string) => boolean,
  ): MissionAudioCue | null
  release(known: (unitId: string) => boolean): MissionAudioCue[]
  clear(): void
  readonly size: number
}

export declare function createSkillCueHold(limit?: number): SkillCueHold

// ---cut-after---
mod.audioCueFor satisfies typeof audioCueFor
mod.effectCueFor satisfies typeof effectCueFor
mod.SKILL_HOLD_LIMIT satisfies typeof SKILL_HOLD_LIMIT
mod.createSkillCueHold satisfies typeof createSkillCueHold
```

## 常量

| 常量 | 说明 |
| --- | --- |
| `MISSION_ACTOR_FADE_SECONDS` | 演员淡出时长，0.6 秒 |
| `MISSION_PROJECTION` | 缺省的透视相机：竖直视角 40°，俯角 30° |
| `MISSION_FEED_EXTRAPOLATE` | 渲染时钟能跑过最新帧的真实秒数，0.12 |
| `MISSION_HUD_BAR` | 头顶条的宽、高与抬升高度，单位是格 |
| `MISSION_HUD_GHOST_DRAIN` | 残影每秒下降的满条比例，0.9 |
| `MISSION_HUD_RING` | 再部署圈的内外半径、抬升高度、弧的份数与数字大小 |
| `MISSION_HUD_SP` | 技力条的高度、间距、就绪光的大小与起伏 |
| `MISSION_HUD_SHAKE` | 头顶条抖动的角速度与幅度 |
| `MISSION_ACTOR_SHAKE` | 装置受击抖动的时长、角速度与幅度 |
| `MISSION_ACTOR_DIE_SECONDS` | 离场前倒下动画的上限，8 秒 |
| `MISSION_ACTOR_SLIDE` | 没有时长的推拉滑行：每 √格 0.14 秒，夹在 0.12–0.45 秒 |
| `MISSION_ACTOR_RECOIL` | 炮台后坐的格数与每秒衰减 |
| `MISSION_PROJECTILE` | 弹道光点的速度（每游戏秒 12 格）、大小与最长时间 |
| `MISSION_ZONE_FADE_SECONDS`、`MISSION_ZONE_OPACITY` | 地面区域的淡入淡出时长与透明度 |
| `MISSION_TILES` | 格子闪光的格数上限、最短时长、大小与透明度 |
| `MISSION_VEIL_RADIUS` | 全屏闪光覆盖的格数 |
| `MISSION_SNOW` | 飘雪与风雪的雪花数、寿命、速度与大小 |
| `MISSION_SLASH` | 刀光的拖尾与新月的时长、大小与宽度 |
| `MISSION_EFFECT_CHEST` | 打在身上的特效离脚下的高度，0.5 格 |
| `MISSION_SPARK_COLORS`、`MISSION_ELEMENT_COLORS` | 命中火花按伤害类型、元素爆发按元素的颜色 |
| `OFFICIAL_FX_RECIPES` | 官方特效各原型画的形状 |
| `OFFICIAL_FX_ANCHOR_TILES` | 官方特效画在单位身上的距离，0.75 格 |
| `OFFICIAL_FX_SCREEN` | 官方特效的全屏闪光半径、寒冷闪光、飘雪范围与火墙长度 |
| `MISSION_GROUND_ATMOSPHERE` | 地面缺省的清屏色与距离雾 |
| `MISSION_GROUND_AREAS` | 参考实现各阶段建的棋盘区域 |
| `MISSION_TEXTURE_POLICY` | 按种类的纹理策略 |
| `MISSION_EVENT_BINDINGS` | 核心事件（`CORE_EVENT_TYPES` 除裸 `cue`）的默认线索绑定 |
| `MISSION_EFFECT_KINDS` | 引擎的特效种类 |
| `MISSION_GROUND_IMAGE_SLOTS` | 地形资源包的图片槽 |
| `MISSION_GROUND_MESH_SLOTS` | 地形资源包的模型槽 |
| `MISSION_GROUND_GATE_NODES` | 出入口模型的节点名 |
| `MISSION_GROUND_HIGHLIGHT` | 地块高亮的颜色、透明度与大小 |
| `MISSION_VIEW_SYSTEM_ORDER` | 每帧视图系统的顺序 |
