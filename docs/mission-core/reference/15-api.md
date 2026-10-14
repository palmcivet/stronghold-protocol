---
title: API 参考
description: arknights-mission-core 公开函数与主要类型的签名，按模块分组。
---

# API 参考

下面按模块列出公开函数与主要类型的签名，字段的含义见各页说明。

## 战斗

```ts
import type {
  BattleEvent,
  BattleInput,
  BattleLedger,
  BattleResult,
  BattleSnapshot,
  BattleSpec,
  MissionModule,
  SystemOrderEntry,
} from "arknights-mission-core"
import * as mod from "arknights-mission-core"

type WorldArchive = ReturnType<mod.Battle["export"]>

export interface Battle {
  step(inputs?: readonly BattleInput[]): void
  snapshot(): BattleSnapshot
  drainEvents(): readonly BattleEvent[]
  result(): BattleResult
  ledger(): BattleLedger
  systemOrder(): readonly SystemOrderEntry[]
  export(): WorldArchive
  contentHash(): string
}

export interface FrameClock {
  advance(
    battle: Battle,
    frameSeconds: number,
    speed?: number,
  ): readonly (readonly BattleEvent[])[]
}

export declare function createBattle(
  spec: BattleSpec,
  modules: readonly MissionModule[],
  archive?: WorldArchive,
): Battle

export declare function runSteps(battle: Battle, steps: number): BattleResult

export declare function createFrameClock(): FrameClock

// ---cut-after---
;({}) as mod.Battle satisfies Battle
;({}) as Battle satisfies mod.Battle
;({}) as mod.FrameClock satisfies FrameClock
;({}) as FrameClock satisfies mod.FrameClock
mod.createBattle satisfies typeof createBattle
mod.runSteps satisfies typeof runSteps
mod.createFrameClock satisfies typeof createFrameClock
```

`WorldArchive` 不从包根导出，用 `ReturnType<Battle["export"]>` 取得。

## 规格

```ts
import type {
  AttackClip,
  AttackShape,
  ConditionalEffectSpec,
  Direction,
  HitArea,
  Motion,
  RouteSpec,
  SkillHooks,
  SkillModifier,
  SkillOperation,
  SpType,
  TileCoord,
  UnitAttributes,
  UnitKind,
  UnitSide,
} from "arknights-mission-core"
import type * as mod from "arknights-mission-core"

export interface CostPoolSpec {
  readonly initial: number
  readonly regen: number
  readonly cap: number
}

export interface TileSpec {
  readonly x: number
  readonly y: number
  readonly height: number
  readonly deployable: boolean
  readonly walkableBy: readonly string[]
  readonly objective?: boolean
  readonly terrain?: string
}

export interface SkillSpec {
  readonly id: string
  readonly body: string
  readonly trigger: string
  readonly spCost: number
  readonly duration: number
  readonly ammo: number
  readonly spType?: SpType
  readonly initSp?: number
  readonly charges?: number
  readonly operation?: SkillOperation
  readonly heal?: boolean
  readonly mods?: readonly SkillModifier[]
  readonly flags?: readonly string[]
  readonly triggerRange?: readonly TileCoord[]
  readonly triggerAllies?: boolean
  readonly triggerHpAtMost?: number
  readonly allyTargets?: boolean
  readonly triggerEnemies?: boolean
  readonly castWithoutEnemy?: boolean
  readonly activateOnDeploy?: boolean
  readonly hooks?: SkillHooks
}

export interface UnitSpec {
  readonly id: string
  readonly side: UnitSide
  readonly owner?: string
  readonly kind?: UnitKind
  readonly attributes: UnitAttributes
  readonly skills: readonly SkillSpec[]
  readonly attackRange: readonly TileCoord[]
  readonly tags: readonly string[]
  readonly deployPositions: readonly string[]
  readonly x: number
  readonly y: number
  readonly facing?: Direction
  readonly hitArea?: HitArea | null
  readonly motion?: Motion
  readonly route?: RouteSpec | null
  readonly attackClip?: AttackClip
  readonly attackShape?: AttackShape
  readonly targetPriority?: string
  readonly blocking?: readonly string[]
  readonly blockedBy?: string | null
  readonly aggroSeq?: number
  readonly hitLimit?: boolean
  readonly immunity?: readonly string[]
  readonly timers?: readonly string[]
  readonly conditionalEffects?: readonly ConditionalEffectSpec[]
  readonly script?: Readonly<Record<string, string | number | boolean>>
}

export interface SpawnSpec {
  readonly atTick: number
  readonly unit: UnitSpec
  readonly inTotal?: boolean
}

export interface BattleSpec {
  readonly seed: number
  readonly modules: readonly string[]
  readonly tiles: readonly TileSpec[]
  readonly units: readonly UnitSpec[]
  readonly spawns: readonly SpawnSpec[]
  readonly deployStrategy: string | null
  readonly cost: {
    readonly ally: CostPoolSpec
    readonly enemy: CostPoolSpec
  }
  readonly notes?: Readonly<Record<string, unknown>>
}
// ---cut-after---
;({}) as mod.BattleSpec satisfies BattleSpec
;({}) as BattleSpec satisfies mod.BattleSpec
;({}) as mod.UnitSpec satisfies UnitSpec
;({}) as UnitSpec satisfies mod.UnitSpec
;({}) as mod.SkillSpec satisfies SkillSpec
;({}) as SkillSpec satisfies mod.SkillSpec
```

`AttackShape` 的字段见 [攻击](./08-attack.md#出手)。

## 快照

```ts
import type {
  Direction,
  RedeploySnapshot,
  TileCoord,
  UnitAttributes,
  UnitKind,
  UnitSide,
} from "arknights-mission-core"
import type * as mod from "arknights-mission-core"

export interface SkillSnapshot {
  readonly id: string
  readonly sp: number
  readonly spCost: number
  readonly charges: number
  readonly active: boolean
  readonly ammo: { readonly left: number; readonly max: number } | null
}

export interface UnitSnapshot {
  readonly id: string
  readonly side: UnitSide
  readonly kind: UnitKind
  readonly x: number
  readonly y: number
  readonly facing: Direction
  readonly height: number
  readonly attributes: UnitAttributes
  readonly maxHp: number
  readonly tags: readonly string[]
  readonly attackRange: readonly TileCoord[]
  readonly deployPositions: readonly string[]
  readonly elements: Readonly<Record<string, number>>
  readonly blocking: readonly string[]
  readonly blockedBy: string | null
  readonly skills: readonly SkillSnapshot[]
  readonly shield: number
  readonly downed: boolean
  readonly redeploy: RedeploySnapshot | null
  readonly unbalanceUntil: number | null
  readonly components: Readonly<Record<string, unknown>>
}

export interface BattleSnapshot {
  readonly tick: number
  readonly units: readonly UnitSnapshot[]
}

export interface LedgerRow {
  readonly kills: number
  readonly leaks: number
  readonly damage: number
  readonly healing: number
  readonly deaths: number
  readonly total: number
  readonly killedInTotal: number
  readonly leakedInTotal: number
  readonly resolved: number
}

export interface BattleLedger {
  readonly battle: LedgerRow
  readonly owners: Readonly<Record<string, LedgerRow>>
}

export interface BattleResult {
  readonly finished: boolean
  readonly winner: UnitSide | null
}
// ---cut-after---
;({}) as mod.BattleSnapshot satisfies BattleSnapshot
;({}) as BattleSnapshot satisfies mod.BattleSnapshot
;({}) as mod.BattleLedger satisfies BattleLedger
;({}) as BattleLedger satisfies mod.BattleLedger
;({}) as mod.BattleResult satisfies BattleResult
;({}) as BattleResult satisfies mod.BattleResult
```

## 模块

```ts
import type {
  BattleEvent,
  BattleEventType,
  ContentContext,
  PhaseSlot,
  Registration,
} from "arknights-mission-core"
import type * as mod from "arknights-mission-core"

export interface MissionModule {
  readonly id: string
  readonly version?: string
  readonly dependsOn?: readonly string[]
  install(ctx: Registration): void
}

export interface PhaseSystem {
  readonly id: string
  readonly slot: PhaseSlot
  readonly priority: number
  readonly before?: readonly string[]
  readonly after?: readonly string[]
  run(ctx: ContentContext): void
}

export type Subscribe = <K extends BattleEventType>(
  type: K,
  handler: (event: BattleEvent<K>, ctx: ContentContext) => void,
) => () => void

// ---cut-after---
;({}) as mod.MissionModule satisfies MissionModule
;({}) as MissionModule satisfies mod.MissionModule
;({}) as mod.PhaseSystem satisfies PhaseSystem
;({}) as PhaseSystem satisfies mod.PhaseSystem
;({}) as Registration["subscribe"] satisfies Subscribe
```

`Registration` 的 `register*` 方法见 [模块 · 注册](./04-module.md#注册)，`ContentContext` 的命令见 [命令](./04-module.md#命令)，查询见 [查询](./04-module.md#查询)。

## 世界

```ts
import type {
  BattleSpec,
  ComponentKey,
  ComponentOptions,
  ExtensibleKey,
  ExtensibleOptions,
  ResourceKey,
  TagKey,
  TagOptions,
} from "arknights-mission-core"
import * as mod from "arknights-mission-core"

export interface ResourceOptions<T> {
  readonly codec?: {
    encode(value: T): unknown
    decode(data: unknown, spec: BattleSpec): T
  }
  readonly transient?: boolean
}

export declare function defineComponent<T>(
  id: string,
  options: ComponentOptions<T>,
): ComponentKey<T>

export declare function defineResource<T>(
  id: string,
  create: (spec: BattleSpec) => T,
  options?: ResourceOptions<T>,
): ResourceKey<T>

export declare function defineTag(id: string, options: TagOptions): TagKey

export declare function defineExtensible<C extends string>(
  id: string,
  options: ExtensibleOptions<C>,
): ExtensibleKey<C>

// ---cut-after---
mod.defineComponent satisfies typeof defineComponent
mod.defineResource satisfies typeof defineResource
mod.defineTag satisfies typeof defineTag
mod.defineExtensible satisfies typeof defineExtensible
```

## 伤害

```ts
import type {
  ContentContext,
  EffectChange,
  HitChange,
  HpChange,
} from "arknights-mission-core"
import type * as mod from "arknights-mission-core"

export interface DamageInfo {
  sourceId: string
  targetId: string
  amount: number
  kind: string
  mul?: number
  defIgnorePct?: number
  defIgnoreFlat?: number
  resIgnorePct?: number
  resIgnoreFlat?: number
  element?: string
  canDodge?: boolean
  sourceless?: boolean
  noSp?: boolean
  ignoreSleep?: boolean
  ignoreSelect?: boolean
  cancel?: boolean
  attack?: boolean
  tags?: readonly string[]
}

export interface DamagePreview {
  readonly sourceId: string
  readonly targetId: string
  readonly amount: number
  readonly kind: string
  readonly steps: readonly string[]
}

interface ModifierBase {
  readonly id: string
  readonly priority: number
}

export type DamageModifierDefinition =
  | (ModifierBase & {
      readonly stage: "hit" | "element-hit"
      modify(change: HitChange, ctx: ContentContext): void
    })
  | (ModifierBase & {
      readonly stage: "hp"
      modify(change: HpChange, ctx: ContentContext): void
    })
  | (ModifierBase & {
      readonly stage: "effect"
      modify(change: EffectChange, ctx: ContentContext): void
    })

export interface ElementDefinition {
  readonly id: string
  readonly order?: number
  readonly cap: number
  readonly resistance: number
  onBurst?(unitId: string, ctx: ContentContext, sourceId?: string): void
}
// ---cut-after---
;({}) as mod.DamageInfo satisfies DamageInfo
;({}) as DamageInfo satisfies mod.DamageInfo
;({}) as mod.DamagePreview satisfies DamagePreview
;({}) as DamagePreview satisfies mod.DamagePreview
;({}) as mod.DamageModifierDefinition satisfies DamageModifierDefinition
;({}) as DamageModifierDefinition satisfies mod.DamageModifierDefinition
;({}) as mod.ElementDefinition satisfies ElementDefinition
;({}) as ElementDefinition satisfies mod.ElementDefinition
```

## 效果与属性

```ts
import type {
  AttributeDefinition,
  AttributeModifier,
  ConditionDefinition,
  ContentContext,
  EffectOptions,
  TagKey,
} from "arknights-mission-core"
import * as mod from "arknights-mission-core"

export interface EffectApplication {
  readonly duration?: number
  readonly value?: number
  readonly stackAs?: number
  readonly sourceId?: string
}

export interface EffectDefinition {
  readonly id: string
  readonly grantsTags: readonly TagKey[]
  readonly modifiers: readonly AttributeModifier[]
  readonly immunity: readonly string[]
  readonly immune?: string
  readonly stackCap: number
  readonly cancels: readonly string[]
  readonly duration: number
  readonly instant: boolean
  readonly period: number
  readonly stacking: string
  readonly valued?: number
  scale?(value: number): readonly AttributeModifier[]
  onApply?(unitId: string, stacks: number, ctx: ContentContext): void
  onTick?(unitId: string, stacks: number, ctx: ContentContext): void
  onRemove?(unitId: string, ctx: ContentContext): void
  readonly keepOnDown?: boolean
  readonly shieldType?: readonly string[]
}

export declare function defineEffect(
  id: string,
  options?: EffectOptions,
): EffectDefinition

export declare function defineAttribute(
  id: string,
  options: {
    readonly base: number
    readonly clamp?: { readonly min?: number; readonly max?: number }
  },
): AttributeDefinition

export declare function defineCondition(
  id: string,
  evaluate: ConditionDefinition["evaluate"],
): ConditionDefinition

// ---cut-after---
;({}) as mod.EffectApplication satisfies EffectApplication
;({}) as EffectApplication satisfies mod.EffectApplication
;({}) as mod.EffectDefinition satisfies EffectDefinition
;({}) as EffectDefinition satisfies mod.EffectDefinition
mod.defineEffect satisfies typeof defineEffect
mod.defineAttribute satisfies typeof defineAttribute
mod.defineCondition satisfies typeof defineCondition
```

## 选择器

```ts
import type { ContentContext, SelectorQuery } from "arknights-mission-core"
import type * as mod from "arknights-mission-core"

export interface SelectorDefinition {
  readonly id: string
  readonly kind?: "filter" | "sort"
  filter(unitId: string, ctx: ContentContext, query: SelectorQuery): boolean
  compare(
    left: string,
    right: string,
    ctx: ContentContext,
    query: SelectorQuery,
  ): number
}
// ---cut-after---
;({}) as mod.SelectorDefinition satisfies SelectorDefinition
;({}) as SelectorDefinition satisfies mod.SelectorDefinition
```

## 攻击计时

```ts
import type { AttackResolver } from "arknights-mission-core"
import * as mod from "arknights-mission-core"

export interface AttackTiming {
  canAttack: boolean
  hitCount: number
  damageScale: number
}

export declare function registerAttackResolver(resolver: AttackResolver): void

export interface AttackSubstituteDefinitionShape {
  readonly id: string
  offer(unitId: string, ctx: mod.ContentContext): readonly string[]
}

export interface AttackSegmentShape {
  readonly hits: number
  readonly scale: number
  readonly kind?: string
  readonly tags?: readonly string[]
}

export interface AttackSegmentDefinitionShape {
  readonly id: string
  segments(
    attackerId: string,
    targetId: string,
    ctx: mod.ContentContext,
  ): AttackSegmentShape | null
}

export declare const ADDITION_TAG: string

// ---cut-after---
;({}) as mod.AttackSegment satisfies AttackSegmentShape
;({}) as AttackSegmentShape satisfies mod.AttackSegment
;({}) as mod.AttackSegmentDefinition satisfies AttackSegmentDefinitionShape
;({}) as AttackSegmentDefinitionShape satisfies mod.AttackSegmentDefinition
mod.ADDITION_TAG satisfies typeof ADDITION_TAG
;({}) as mod.AttackSubstituteDefinition satisfies AttackSubstituteDefinitionShape
;({}) as AttackSubstituteDefinitionShape satisfies mod.AttackSubstituteDefinition
;({}) as mod.AttackTiming satisfies AttackTiming
;({}) as AttackTiming satisfies mod.AttackTiming
mod.registerAttackResolver satisfies typeof registerAttackResolver
```

`readAttackTiming`、`consumeAttackTiming`、`independentDt` 与 `setAttackTargetThisTick` 的参数是引擎内部的世界、单位记录与注册表，它们如何配合见 [架构设计](../maintain/01-architecture.md#攻击的持有状态)。

## 身体与朝向

```ts
import type {
  BoardSpan,
  BodyRect,
  BodyUnit,
  Direction,
  KeyCollection,
} from "arknights-mission-core"
import * as mod from "arknights-mission-core"

export declare function bodyRect(unit: BodyUnit): BodyRect | null

export declare function bodyKeys(unit: BodyUnit, span: BoardSpan): readonly string[]

export declare function bodyOnTile(unit: BodyUnit, x: number, y: number): boolean

export declare function bodyInKeys(
  unit: BodyUnit,
  keys: KeyCollection,
  span: BoardSpan,
): boolean

export declare function bodyDist(unit: BodyUnit, x: number, y: number): number

export declare function bodyInRadius(
  unit: BodyUnit,
  x: number,
  y: number,
  radius: number,
): boolean

export declare function rotateOffset(
  dRow: number,
  dCol: number,
  facing: Direction,
): readonly [number, number]

export declare function offsetTile(
  row: number,
  col: number,
  dRow: number,
  dCol: number,
  facing: Direction,
): readonly [number, number]

export declare function frontTile(
  row: number,
  col: number,
  facing: Direction,
  steps?: number,
): readonly [number, number]

export declare function oppositeDirection(facing: Direction): Direction

// ---cut-after---
mod.bodyRect satisfies typeof bodyRect
mod.bodyKeys satisfies typeof bodyKeys
mod.bodyOnTile satisfies typeof bodyOnTile
mod.bodyInKeys satisfies typeof bodyInKeys
mod.bodyDist satisfies typeof bodyDist
mod.bodyInRadius satisfies typeof bodyInRadius
mod.rotateOffset satisfies typeof rotateOffset
mod.offsetTile satisfies typeof offsetTile
mod.frontTile satisfies typeof frontTile
mod.oppositeDirection satisfies typeof oppositeDirection
```

## 场地与随机数

```ts
import type {
  FieldGrid,
  GridPoint,
  Motion,
  Random,
  TileSpec,
} from "arknights-mission-core"
import * as mod from "arknights-mission-core"

export declare function createGrid(
  tiles: readonly TileSpec[],
  span?: readonly GridPoint[],
): FieldGrid

export declare function fearReachableTiles(
  grid: FieldGrid,
  motion: Motion,
  hitX: number,
  hitY: number,
  sourceX: number,
  sourceY: number,
  selfFear: boolean,
  goal: GridPoint | null,
): readonly string[]

export declare function fearSteps(
  grid: FieldGrid,
  motion: Motion,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  limit: number,
): number

export declare function attractPoints(
  grid: FieldGrid,
  motion: Motion,
  x: number,
  y: number,
  targetX: number,
  targetY: number,
): GridPoint[]

export declare function createRandom(seed?: number): Random

export declare function deriveSeed(seed: number, salt: string): number

// ---cut-after---
mod.createGrid satisfies typeof createGrid
mod.fearReachableTiles satisfies typeof fearReachableTiles
mod.fearSteps satisfies typeof fearSteps
mod.attractPoints satisfies typeof attractPoints
mod.createRandom satisfies typeof createRandom
mod.deriveSeed satisfies typeof deriveSeed
```

`planFearMove` 返回包内的落点类型，落点怎么选见 [架构设计](../maintain/01-architecture.md#恐惧落点)。

## 地形

```ts
import type {
  ComponentKey,
  ContentContext,
  TerrainDefinition,
  TerrainStanding,
  UnitSide,
} from "arknights-mission-core"
import type * as mod from "arknights-mission-core"
import * as core from "arknights-mission-core"

export interface TerrainAffects {
  readonly sides?: readonly UnitSide[]
  readonly airborne?: boolean
}

export interface TerrainDefinitionShape {
  readonly id: string
  readonly effect?: string
  readonly linger?: number | ((ctx: ContentContext) => number)
  readonly period?: number
  readonly affects?: TerrainAffects
  readonly pathCost?: number
  readonly tieBreak?: number
  readonly deployable?: boolean
  onEnter?(unitId: string, ctx: ContentContext): void
  onStay?(unitId: string, ctx: ContentContext, count: number): void
  onLeave?(unitId: string, ctx: ContentContext): void
}

export interface TerrainStandingShape {
  readonly terrain: string
  readonly since: number
  readonly count: number
}

export declare function defineTerrain(
  id: string,
  definition: Omit<TerrainDefinition, "id">,
): TerrainDefinition

export declare function terrainSource(id: string): string

export declare const TERRAIN_STANDING: ComponentKey<TerrainStanding>

// ---cut-after---
;({}) as mod.TerrainAffects satisfies TerrainAffects
;({}) as mod.TerrainDefinition satisfies TerrainDefinitionShape
;({}) as TerrainStanding satisfies TerrainStandingShape
core.defineTerrain satisfies typeof defineTerrain
core.terrainSource satisfies typeof terrainSource
core.TERRAIN_STANDING satisfies typeof TERRAIN_STANDING
```

## 装置作用区

```ts
import type {
  ComponentKey,
  ContentContext,
  Direction,
  TagKey,
  ZoneDefinition,
  ZoneStanding,
} from "arknights-mission-core"
import type * as mod from "arknights-mission-core"
import * as core from "arknights-mission-core"

export interface ZoneVisit {
  readonly deviceId: string
  readonly facing: Direction
  readonly moved: { readonly dx: number; readonly dy: number } | null
}

export interface ZoneDefinitionShape {
  readonly id: string
  readonly source: TagKey
  onStay(unitId: string, ctx: ContentContext, visit: ZoneVisit): void
  onLeave?(unitId: string, ctx: ContentContext): void
}

export interface ZoneStandingShape {
  readonly x: number
  readonly y: number
  readonly zones: Readonly<Record<string, string>>
}

export declare function defineZone(
  id: string,
  definition: Omit<ZoneDefinition, "id">,
): ZoneDefinition

export declare const ZONE_STANDING: ComponentKey<ZoneStanding>

// ---cut-after---
;({}) as mod.ZoneVisit satisfies ZoneVisit
;({}) as mod.ZoneDefinition satisfies ZoneDefinitionShape
;({}) as ZoneStanding satisfies ZoneStandingShape
core.defineZone satisfies typeof defineZone
core.ZONE_STANDING satisfies typeof ZONE_STANDING
```

## 官方地形

```ts
import type { ExtensibleKey, TagKey } from "arknights-mission-core"
import * as core from "arknights-mission-core"

export declare const OFFICIAL_TERRAINS: {
  readonly mire: ExtensibleKey<"terrain">
  readonly smog: ExtensibleKey<"terrain">
  readonly deepsea: ExtensibleKey<"terrain">
  readonly infection: ExtensibleKey<"terrain">
  readonly airflow: ExtensibleKey<"zone">
}

export declare const BLOWER: TagKey

export declare const FUNNEL: TagKey

export declare const FUNNEL_DAMAGE_TAG: string

export declare const FUNNEL_DEFAULTS: {
  readonly init: number
  readonly delta: number
  readonly max: number
  readonly drones: number
}

export declare const BOSS: TagKey

export declare const ELITE: TagKey

// ---cut-after---
core.OFFICIAL_TERRAINS satisfies typeof OFFICIAL_TERRAINS
core.BLOWER satisfies typeof BLOWER
core.FUNNEL satisfies typeof FUNNEL
core.FUNNEL_DAMAGE_TAG satisfies typeof FUNNEL_DAMAGE_TAG
core.FUNNEL_DEFAULTS satisfies typeof FUNNEL_DEFAULTS
core.BOSS satisfies typeof BOSS
core.ELITE satisfies typeof ELITE
```

## 内置模块

```ts
import type { MissionModule } from "arknights-mission-core"
import * as mod from "arknights-mission-core"

// ---cut-after---
mod.costModule satisfies MissionModule
mod.deployModule satisfies MissionModule
mod.blockModule satisfies MissionModule
mod.leakModule satisfies MissionModule
mod.redeployModule satisfies MissionModule
mod.officialTerrainModule satisfies MissionModule
mod.officialRankModule satisfies MissionModule
mod.officialFunnelModule satisfies MissionModule
```

| 模块 | id | 见 |
| --- | --- | --- |
| `costModule` | `cost` | [费用](./12-field.md#费用) |
| `deployModule` | `deploy` | [部署策略](./04-module.md#部署策略) |
| `blockModule` | `block` | [阻挡](./12-field.md#阻挡) |
| `leakModule` | `leak` | [泄漏](./12-field.md#泄漏) |
| `redeployModule` | `redeploy` | [再部署](./12-field.md#再部署) |
| `officialTerrainModule` | `official-terrain` | [官方地形](./14-terrain.md#官方地形) |
| `officialRankModule` | `official-rank` | [官方等级标签](./05-world.md#官方等级标签) |
| `officialFunnelModule` | `official-funnel` | [官方浮游单元](./08-attack.md#官方浮游单元) |

## 技能与模块的选择

```ts
import type {
  ChessRecord,
  GridCell,
  LoadoutRequest,
  RangeGrid,
  TalentChange,
  TalentRecord,
} from "arknights-mission-core"
import * as mod from "arknights-mission-core"

export declare function resolveRecordLoadout(
  rec: unknown,
  loadout?: LoadoutRequest | null,
): ResolvedRecordLoadout | null

export declare function loadoutRecord<R extends ChessRecord | null | undefined>(
  rec: R,
  lo: ResolvedRecordLoadout | null | undefined,
): R | ChessRecord

export declare function composeStats(
  statsBase: Readonly<Record<string, number>> | null | undefined,
  attr: Readonly<Record<string, number>> | null | undefined,
): Record<string, number>

export declare function composeTalents(
  base: readonly TalentRecord[] | null | undefined,
  changes: readonly TalentChange[] | null | undefined,
): TalentRecord[]

export declare function attackRangeGrid(rec: unknown): RangeGrid | GridCell[] | null

export declare function traitRangeExtend(rec: unknown): number

export declare function extendedGrid(grid: unknown, extend?: number): GridCell[]

export interface ResolvedRecordLoadout {
  readonly skillIndex: number | null
  readonly moduleId: string | null
  readonly skillIsDefault: boolean
  readonly moduleIsDefault: boolean
  readonly isDefault: boolean
}

// ---cut-after---
mod.resolveRecordLoadout satisfies typeof resolveRecordLoadout
mod.loadoutRecord satisfies typeof loadoutRecord
mod.composeStats satisfies typeof composeStats
mod.composeTalents satisfies typeof composeTalents
mod.attackRangeGrid satisfies typeof attackRangeGrid
mod.traitRangeExtend satisfies typeof traitRangeExtend
mod.extendedGrid satisfies typeof extendedGrid
;({}) as mod.ResolvedRecordLoadout satisfies ResolvedRecordLoadout
;({}) as ResolvedRecordLoadout satisfies mod.ResolvedRecordLoadout
```

`ChessRecord`、`SkillRecord`、`ModuleRecord`、`TalentRecord`、`TalentChange`、`TraitRecord`、`ModuleState` 是记录里这些工具读的字段；其他字段原样保留。

## 事件数据

核心事件的 `data` 类型。可拦截的事件在 `BattleEventMap` 里包成 `Intercept<数据>`。

```ts
import type { BattleInput, UnitSide } from "arknights-mission-core"
import * as mod from "arknights-mission-core"

/** 普攻出手前。订阅者把 cancel 改成 true 时这一下不打出去。 */
export type AttackEvent = {
  readonly unitId: string;
  readonly targetIds: readonly string[];
  cancel: boolean;
  /** 改成 true 时这一下不用掉弹药、不送 ammo-used，照样算一次攻击。缺省没有。 */
  noAmmo?: boolean;
  /** 出手时正在生效的主动技能的下标（见 attack-hit）。 */
  readonly skillSlot?: number;
  /** 这一下没有普通目标，目标由登记的普攻替代给出：不结算伤害，只算一次攻击。 */
  readonly substitute?: true;
};

/** 一次普攻打了出去。noAmmo 为真时这一下不用掉弹药。 */
export type AttackHitEvent = {
  readonly unitId: string;
  readonly noAmmo?: true;
  /** 这一下的目标由普攻替代给出，没有结算伤害。只在这时带 targetIds。 */
  readonly substitute?: true;
  readonly targetIds?: readonly string[];
  /** 出手时正在生效的主动技能在单位技能列表里的下标，从 0 数起。没有生效的主动技能时没有这个字段。 */
  readonly skillSlot?: number;
};

/** 一次伤害进入减伤之前，hit 阶段的伤害修饰都已执行。数值的修改走伤害修饰。 */
export type HitEvent = {
  readonly sourceId: string;
  /** 记功的单位。sourceless 时 sourceId 是空串，creditId 仍是出手者。 */
  readonly creditId: string;
  readonly targetId: string;
  readonly amount: number;
  readonly kind: string;
  /** hit 阶段的修饰取消了这一击。 */
  readonly cancel: boolean;
  readonly sourceless: boolean;
  readonly element?: string;
  /** 来自普攻时，出手那一刻正在生效的主动技能的下标（见 attack-hit）。投射物到达时仍是出手时的值。 */
  readonly skillSlot?: number;
  /** 普攻带附加段时，本体与附加段共用的 id。 */
  readonly attackId?: string;
};

/** 元素损伤进槽之前，element-hit 阶段的伤害修饰都已执行。字段与 hit 相同，另带倍率。 */
export type ElementHitEvent = HitEvent & { readonly mul: number };

/** 麻痹打断敌人的一次普攻，用掉一层之前。订阅者把 keep 改成 true 时这一层留着；这次普攻照样被打断。 */
export type PalsyInterruptEvent = {
  readonly unitId: string;
  /** 用掉之前的层数。 */
  readonly stacks: number;
  keep: boolean;
};

/** 生命降到 0。订阅者把 prevented 改成 true 时留 1 点生命。 */
export type FatalEvent = {
  readonly sourceId: string;
  readonly creditId: string;
  readonly targetId: string;
  readonly amount: number;
  readonly kind: string;
  prevented: boolean;
  readonly sourceless: boolean;
};

export type DamagedEvent = {
  readonly sourceId: string;
  readonly creditId: string;
  readonly targetId: string;
  readonly amount: number;
  /** 实际扣掉的生命：结算前的生命减去结算后的生命，不含溢出。 */
  readonly applied: number;
  readonly kind: string;
  /** 结算之后的生命。 */
  readonly hp: number;
  readonly sourceless: boolean;
  readonly attack?: true;
  /** 这一击不触发受击回复。 */
  readonly noSp?: true;
  /** 官方红字：见 `DamageInfo.red`。 */
  readonly red?: true;
  /** 普攻带附加段时，本体与附加段共用的 id。 */
  readonly attackId?: string;
};

/** 闪避掉的一击。`miss` 表示这一击没闪开时会是红字，官方此时显示 MISS。 */
export type DodgedEvent = {
  readonly sourceId: string;
  readonly targetId: string;
  readonly kind: string;
  readonly miss?: true;
};

/** 流失：不经伤害步骤的扣血。 */
export type LossEvent = {
  readonly unitId: string;
  readonly amount: number;
  readonly hp: number;
};

export type HealEvent = {
  readonly unitId: string;
  /** 没有来源时是空串。 */
  readonly sourceId: string;
  /** 实际加上的生命。 */
  readonly amount: number;
  readonly hp: number;
};

export type UnitEvent = {
  readonly unitId: string;
};

/** 这一拍开始时接受的玩家输入。 */
export type InputEvent = {
  readonly input: BattleInput;
};

/** 这一拍开始时拒绝的玩家输入与原因，世界不变。 */
export type InputRefusedEvent = {
  readonly input: BattleInput;
  readonly reason: string;
};

/** 倒下。有部署策略时带上倒下的格子与能否站在那里。 */
export type DownedEvent = {
  readonly unitId: string;
  readonly x?: number;
  readonly y?: number;
  readonly canStand?: boolean;
};

/** 被移到 x、y。duration 是位移时长（秒），keepFacing 为真时画面保持原朝向。 */
export type DisplaceEvent = {
  readonly unitId: string;
  readonly x: number;
  readonly y: number;
  readonly duration: number;
  readonly keepFacing: boolean;
};

export type BlockEvent = {
  readonly blockerId: string;
  readonly enemyId: string;
};

export type CostEvent = {
  readonly side: UnitSide;
  readonly value: number;
};

export type ProjectileEvent = {
  readonly id: string;
  readonly sourceId: string;
  readonly targetId: string;
};

export type SkillEvent = {
  readonly unitId: string;
  readonly skillId: string;
  readonly reason: string;
};

export type AmmoUsedEvent = {
  readonly unitId: string;
  readonly skillId: string;
  readonly left: number;
};

export type StatusEvent = {
  readonly unitId: string;
  readonly statusId: string;
  readonly stacks: number;
  /** 施加之前身上没有这个效果（条件效果挂上的也算有）：这次是新开始，不是刷新、加层或排进等待链。 */
  readonly entered: boolean;
};

export type ElementBurstEvent = {
  readonly sourceId: string;
  readonly targetId: string;
  readonly element: string;
};


/** 单位进入或离开一格地形。x、y 是站位系统判定时所站的格子。 */
export type TerrainEvent = {
  readonly unitId: string;
  readonly terrain: string;
  readonly x: number;
  readonly y: number;
};

// ---cut-after---
;({}) as mod.AttackEvent satisfies AttackEvent
;({}) as AttackEvent satisfies mod.AttackEvent
;({}) as mod.AttackHitEvent satisfies AttackHitEvent
;({}) as AttackHitEvent satisfies mod.AttackHitEvent
;({}) as mod.HitEvent satisfies HitEvent
;({}) as HitEvent satisfies mod.HitEvent
;({}) as mod.ElementHitEvent satisfies ElementHitEvent
;({}) as ElementHitEvent satisfies mod.ElementHitEvent
;({}) as mod.PalsyInterruptEvent satisfies PalsyInterruptEvent
;({}) as PalsyInterruptEvent satisfies mod.PalsyInterruptEvent
;({}) as mod.FatalEvent satisfies FatalEvent
;({}) as FatalEvent satisfies mod.FatalEvent
;({}) as mod.DamagedEvent satisfies DamagedEvent
;({}) as DamagedEvent satisfies mod.DamagedEvent
;({}) as mod.DodgedEvent satisfies DodgedEvent
;({}) as DodgedEvent satisfies mod.DodgedEvent
;({}) as mod.LossEvent satisfies LossEvent
;({}) as LossEvent satisfies mod.LossEvent
;({}) as mod.HealEvent satisfies HealEvent
;({}) as HealEvent satisfies mod.HealEvent
;({}) as mod.UnitEvent satisfies UnitEvent
;({}) as UnitEvent satisfies mod.UnitEvent
;({}) as mod.InputEvent satisfies InputEvent
;({}) as InputEvent satisfies mod.InputEvent
;({}) as mod.InputRefusedEvent satisfies InputRefusedEvent
;({}) as InputRefusedEvent satisfies mod.InputRefusedEvent
;({}) as mod.DownedEvent satisfies DownedEvent
;({}) as DownedEvent satisfies mod.DownedEvent
;({}) as mod.DisplaceEvent satisfies DisplaceEvent
;({}) as DisplaceEvent satisfies mod.DisplaceEvent
;({}) as mod.BlockEvent satisfies BlockEvent
;({}) as BlockEvent satisfies mod.BlockEvent
;({}) as mod.CostEvent satisfies CostEvent
;({}) as CostEvent satisfies mod.CostEvent
;({}) as mod.ProjectileEvent satisfies ProjectileEvent
;({}) as ProjectileEvent satisfies mod.ProjectileEvent
;({}) as mod.SkillEvent satisfies SkillEvent
;({}) as SkillEvent satisfies mod.SkillEvent
;({}) as mod.AmmoUsedEvent satisfies AmmoUsedEvent
;({}) as AmmoUsedEvent satisfies mod.AmmoUsedEvent
;({}) as mod.StatusEvent satisfies StatusEvent
;({}) as StatusEvent satisfies mod.StatusEvent
;({}) as mod.ElementBurstEvent satisfies ElementBurstEvent
;({}) as ElementBurstEvent satisfies mod.ElementBurstEvent
;({}) as mod.TerrainEvent satisfies TerrainEvent
;({}) as TerrainEvent satisfies mod.TerrainEvent
```

## 常量

| 常量 | 值或内容 |
| --- | --- |
| `TICK` | `1 / 30` |
| `FRAME_CATCHUP` | 150 |
| `PHASE_SLOTS` | 十个阶段槽，按执行顺序 |
| `CORE_EVENT_TYPES` | 全部核心事件名，封闭；元素类型是 `CoreEventType` |
| `BATTLE_INPUT_TYPES` | `deploy`、`retreat`、`redeploy`、`cast` |
| `DAMAGE_STAGES` | 伤害修饰的阶段 |
| `EXTENSIBLE_CONTRACTS` | 可扩展的注册表名 |
| `MODIFIER_OPS` | `add`、`percent`、`mul`、`independent` |
| `CORE_TAGS` | 全部核心标签 |
| `BUILTIN_SKILL_BODIES` | 内置技能体 id |
| `ELEMENT_ORDER` | 元素槽显示的先后 |
| `DEPLOY_STRATEGY` | 内置部署策略的 id |
| `AUTO_OP_COOLDOWN` | 手动技能的自动释放冷却，3 秒 |
| `PROJECTILE_SPEED` | 缺省投射物速度，12 格/秒 |
| `PROJECTILE_MAX_AGE` | 投射物最长飞行，10 秒 |
| `PROJECTILE_KIND_SPEEDS` | 各投射物种类的速度 |
| `BLOCK_RADIUS` 等 | 阻挡接触半径，见 [阻挡](./12-field.md#阻挡) |
| `PUSH_TILES` 等 | 推拉的距离表，见 [位移](./12-field.md#位移) |
| `PULL_ORIGIN` | 拉力经 `pullerId` 拉到面前时，落点在该单位朝向前方的距离（0.5 格）；见 [位移](./12-field.md#位移) |
| `SHIFT_PUSH`、`SHIFT_PULL`、`SHIFT_FEAR`、`SHIFT_ATTRACT` | 内置位移的 id：`push`、`pull`、`fear`、`attract` |
| `BLOCK_RADIUS_DEVICE_SQ`、`BLOCK_RADIUS_FLY_SQ` | 装置与对空的阻挡接触半径的平方 |
| `UNIT_SIDES` | `ally`、`enemy` |
| `UNIT_KINDS` | `operator`、`enemy`、`token`、`device` |
| `MOTIONS` | `WALK`、`FLY` |
| `DIRECTIONS` | `UP`、`RIGHT`、`DOWN`、`LEFT` |
| `ATTACK_DAMAGE_KINDS` | 普攻的伤害种类：`physical`、`arts`、`heal` |
| `PROJECTILE_KINDS` | 投射物种类：`arrow`、`bolt`、`orb`、`bomb`、`boomerang` |
| `SP_TYPES` | 技力类型：`time`、`attack`、`hurt`、`none` |
| `SKILL_OPERATIONS` | 技能操作：`MANUAL`、`AUTO` |
| `STACKINGS` | 叠加策略：`refresh`、`extend`、`stack`、`independent`、`strongest`、`keep` |
| `MULTIPLIER_ATTRIBUTES` | 基础值为 1 的乘区属性，如 `dmgDealt`、`physTaken`、`healingTaken` |
| `ENEMIES_IN_RANGE` | 内置条件：攻击范围内的敌人不少于 `count`（缺省 1） |
| `CHARGE_TIMER`、`AMMO_TIMER`、`BOOMERANG_TIMER` | 内置计时器的 id：`charge`、`ammo`、`boomerang` |
| `CHARGE_CAP_ATTRIBUTE` | 充能上限读的属性 `times` |
| `AMMO_CAP_ATTRIBUTE`、`AMMO_SCALE_ATTRIBUTE` | 弹药上限读 `ammoMax`，弹药倍率读 `atk_scale` |
| `BOOMERANGS_OUT_ATTRIBUTE` | 飞出去的回旋镖数 `boomerangsOut` |
| `TIMER_RATE_ATTRIBUTE` | 计时器速率读的属性 `timerRate` |
| `REDEPLOY_MUL_ATTRIBUTE` | 再部署倍率读的属性 `redeployMul` |
