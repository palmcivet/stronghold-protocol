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

`Registration` 的 `register*` 方法见 [模块](./04-module.md#注册)，`ContentContext` 的命令与查询见 [命令和查询](./04-module.md#命令和查询)。

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
  ignoreSleep?: boolean
  ignoreSelect?: boolean
  cancel?: boolean
  attack?: boolean
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

// ---cut-after---
;({}) as mod.AttackTiming satisfies AttackTiming
;({}) as AttackTiming satisfies mod.AttackTiming
mod.registerAttackResolver satisfies typeof registerAttackResolver
```

`readAttackTiming`、`consumeAttackTiming`、`independentDt` 与 `setAttackTargetThisTick` 的参数是引擎内部的世界、单位记录与注册表，它们如何配合见 [架构设计](./16-architecture.md#攻击的持有状态)。

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

`planFearMove` 返回包内的落点类型，落点怎么选见 [架构设计](./16-architecture.md#恐惧落点)。

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
```

| 模块 | id | 见 |
| --- | --- | --- |
| `costModule` | `cost` | [费用](./12-field.md#费用) |
| `deployModule` | `deploy` | [部署策略](./04-module.md#扩展) |
| `blockModule` | `block` | [阻挡](./12-field.md#阻挡) |
| `leakModule` | `leak` | [泄漏](./12-field.md#泄漏) |
| `redeployModule` | `redeploy` | [再部署](./12-field.md#再部署) |

## 常量

| 常量 | 值或内容 |
| --- | --- |
| `TICK` | `1 / 30` |
| `FRAME_CATCHUP` | 150 |
| `PHASE_SLOTS` | 十个阶段槽，按执行顺序 |
| `BATTLE_INPUT_TYPES` | `retreat`、`redeploy`、`cast` |
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
