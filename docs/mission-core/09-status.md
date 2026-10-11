---
title: 效果与属性
description: 效果是纯数据的定义加一条记录，applyEffect 按 id 施加，叠加策略、条件和属性都按 id 注册。属性按定义的基础值和五个阶段聚合。
---

# 效果与属性

## 施加与取下

```ts
applyEffect(unitId: string, effectId: string, application?: EffectApplication): void
removeEffect(unitId: string, effectId: string): void

interface EffectApplication {
  duration?: number
  value?: number
  stackAs?: number
}
```

`duration` 是秒。缺省时用定义上的 `duration`，那个数是效果计时器的拍数；不大于 0 表示一直持续。传入 `Infinity` 也是一直持续。0、负数或非有限数这次施加不成立。正数秒换成拍数，至少 1 拍。`value` 缺省用定义上的 `valued`，再没有则是 0。`stackAs` 只用于 `strongest` 叠法排先后，不改变生效的数值。

单位免疫，或这次被拒绝时，不施加。飞行单位（缚地中的除外）和已经浮空的单位不再接受 `levitate`。叠加之前先跑伤害修饰的 `effect` 阶段（见 05-damage），可以改这次的拍数、强度或取消；内置的抵抗与重量减半就是这一阶段 priority 100 与 200 的修饰，见下文。施加时可以带 `sourceId`，交给这一阶段。施加成功后开始效果计时器，送出 `status` 事件（事件名与 `statusId` 字段沿用，画面与回放不受影响）；`entered` 为真表示施加之前身上没有这个效果（条件效果挂上的也算有），刷新与加层为假。较弱的施加排进等待链时不送 `status`（与 master 的事件对齐留到步骤 8）。效果槽每拍按 `period` 调用 `onTick`。非永久的剩余拍数减 1，到 0 时接上等待链里的下一项，没有则取下并调用 `onRemove`。`removeEffect` 取下这个 id 的全部记录并调用 `onRemove`。友方倒下或撤下时取下身上全部效果，各调用一次 `onRemove`；定义写了 `keepOnDown`（特性、天赋这类常驻效果）的留着，再部署时还在。

## 定义

```ts
interface EffectDefinition {
  id: string
  grantsTags: readonly TagKey[]
  modifiers: readonly AttributeModifier[]
  immunity: readonly string[]
  immune?: string
  stackCap: number
  cancels: readonly string[]
  duration: number
  instant: boolean
  period: number
  stacking: string
  valued?: number
  scale?(value: number): readonly AttributeModifier[]
  onApply?(unitId: string, stacks: number, ctx: ContentContext): void
  onTick?(unitId: string, stacks: number, ctx: ContentContext): void
  onRemove?(unitId: string, ctx: ContentContext): void
  readonly keepOnDown?: boolean
}

function defineEffect(id: string, options?: EffectOptions): EffectDefinition
```

`defineEffect` 按秒给出 `duration` 与 `period`，换成拍数；没写的字段取缺省：不授予标签、没有修饰、一层、一直持续、每拍、`refresh` 叠法。`instant` 为真时只调用 `onApply`、送出 `status`，不留记录。

`grantsTags` 是效果在身上时以 `status:<效果id>` 为来源授予的标签，施加、刷新、取下时重算。标签要用 `defineTag` 定义的键，见 [世界、组件、资源与标签](./04-world.md)。

`immune` 是「挡住我时，单位 `immunity` 里的名字」。它可以和效果 id 不同。`immunity` 数组是这个效果在身上时，用来挡住别的效果的名字，名单用效果 id 或免疫名。

## 叠加策略

`stacking` 是已注册叠加策略的 id。内置：

| id | 行为 |
| --- | --- |
| `refresh` | 剩余时间换成这次的时长并加一层，直到 `stackCap`。缺省 |
| `extend` | 剩余时间取原有剩余与这次中更长的，并加一层，直到 `stackCap` |
| `stack` | 按 `value` 加层（缺省 1），不超过 `stackCap`，时长不变 |
| `independent` | 每次施加各自一条记录，各算各的时长；同时最多 `stackCap` 条，满了先去掉最早的一条（不调用 `onRemove`，这个效果还在身上） |
| `keep` | 已经在身上时这次施加不生效，留着原来的时长与强度 |
| `strongest` | 见下文内置叠法 |

模块用 `registerStacking` 加自己的策略。内置五种标成可扩展，可以 `replace` 或 `wrap`。

## 条件效果

```ts
interface ConditionalEffectSpec {
  condition: string
  effect: string
  value?: number
  params?: Readonly<Record<string, string | number | boolean>>
}
```

单位规格的 `conditionalEffects` 列出按条件挂上的效果。系统 `engine:conditional-effects` 在效果计时器之前，每拍对在场、未倒下的单位求条件，成立时挂上一条永久记录，不成立时取下。条件按 id 注册（`registerCondition`）。内置 `enemies-in-range`：攻击范围内的敌方不少于 `params.count`（缺省 1）。规格里的条件 id 与效果 id 在创建时检查，未注册时报 `UnknownRegistrationError`。

## 属性

```ts
interface AttributeDefinition {
  id: string
  base: number
  clamp?: { min?: number; max?: number }
}

function defineAttribute(id: string, options: { base: number; clamp?: { min?: number; max?: number } }): AttributeDefinition
```

读取属性时按下面的阶段聚合效果、带时限的修饰和正在生效的技能修饰：

```text
(基础 + add) × (1 + percent) × mul × independent
```

`independent` 是独立乘区，与 `mul` 一样相乘，留给需要与直接乘算分开计的来源（例如练度）。基础值取单位规格，规格没写时取属性定义的 `base`，未注册的属性是 0。内置注册的乘区属性 `dmgDealt`、`dmgTaken` 等基础值是 1。结果不是有限数时退回基础值（基础值本身也不是有限数时退回定义的 `base`），再按 `clamp` 夹住。引擎内部读取时可以带一个 `assumed` 基础值，规格没写时用它代替定义的 `base`，不改单位规格。当前生命是单位上存放的 `hp`，不走这条公式。

最大生命用 `hp` 和 `maxHp` 的修饰一起算，基础取 `maxHp`，没有则取 `hp`。最大生命变了时，在场单位的当前生命按新旧上限之比缩放，夹在 0 到新上限之间，不取整；不在场或倒下的单位只记下新上限。缩放在这一拍里第一次读到最大生命时发生，没人读时在 `finale` 槽的 `engine:max-hp`（拍末）。快照不读最大生命，不改状态。

## 免疫名

| 状态 id | 免疫名 |
| --- | --- |
| `freeze` | `frozen` |
| `fear` | `feared` |
| `tremble` | `feared` |
| `stun`、`sleep`、`silence`、`levitate`、`palsy` | 与状态 id 相同 |

## 内置叠法

`slow`、`fragile`、`artsFragile`、`physFragile`、`elemFragile`、`taunt`、`weaken`、`aspdDown`、`defDown`、`resDown` 用 `strongest`：同名取强度（`stackAs`，没有则 `value` 的绝对值）最高的一次。其余按强度排成等待链，当前一次结束后依次接上仍未到期的；强度相同的保留到期更晚的那次。正在生效的一次按剩余拍数计时：在效果槽之前施加的，当拍就减去第一拍；在效果槽之后施加的，从下一拍开始减。等待项记下到期拍（施加时的拍数加时长），接上后在到期拍的效果槽结束。`removeEffect` 连等待链一起取下。

`palsy` 用 `stack`：按 `value` 加层，缺省加 1，上限 3。

`resist` 的强度缩短控制状态这次施加的时长，系数是 `1 - 抵抗`，抵抗不超过 0.95，缺省强度 0.5，在叠加之前算好。被缩短的有 `stun`、`freeze`、`cold`、`sleep`、`fear`、`tremble`、`attract`、`levitate`、`bind`、`groundbind`、`silence`、`disarm`、`sluggish`、`slow`。一直持续的不缩短。麻痹不缩短时间，`resist` 每 5 秒让它掉 1 层。

## 内置效果

`stun`、`freeze`、`cold`、`sleep`、`slow`、`sluggish`、`bind`、`groundbind`、`fragile`、`artsFragile`、`physFragile`、`elemFragile`、`silence`、`fear`、`tremble`、`disarm`、`stealth`、`stealthOff`、`camou`、`reveal`、`invulnerable`、`levitate`、`palsy`、`taunt`、`weaken`、`aspdDown`、`defDown`、`resDown`、`unblockable`、`attract`、`resist`、`liftoff`、`isolated`、`overheal`。

没有带强度的内置效果用 `extend` 叠加：再次施加取剩余与这次中更长的。

`freeze` 施加在敌人身上时法抗减 15。`cold` 让攻速减 30。寒冷叠到身上已有的寒冷、并且没有免疫冻结时，单位冻结：时长取已有寒冷的剩余与这次寒冷（已按抵抗缩短）中更长的，冻结不再按抵抗缩短，已经在冻结中则取更长的；两段都没有正数时长时用 3 秒，永久则冻结也永久。敌人身上这对寒冷变成冻结，寒冷取下，第二次寒冷不送 `status`；友方的寒冷留着。免疫冻结的单位只把寒冷延长到更长的那段。`levitate` 与 `groundbind` 在 `massLevel` 大于 3 时持续时间减半。

`groundbind`（缚地）带 `groundbind` 与 `no-move`，`moveSpeed` 乘 0。缚地的敌人算地面单位：近战、阻挡与打不到空中的选择都按地面算；再被浮空时仍算空中。移动与寻路照旧看 `motion`。

带强度的缺省值和修饰：

| id | 缺省强度 | 修饰 |
| --- | --- | --- |
| `slow` | 0.5 | `moveSpeed` 乘 (1 − 强度) |
| `sluggish` |  | `moveSpeed` 乘 0.2 |
| `bind` |  | `moveSpeed` 乘 0 |
| `groundbind` |  | `moveSpeed` 乘 0 |
| `fragile` | 0.3 | `dmgTaken` 乘 (1 + 强度) |
| `artsFragile` | 0.3 | `artsTaken` 乘 (1 + 强度) |
| `physFragile` | 0.3 | `physTaken` 乘 (1 + 强度) |
| `elemFragile` | 0.2 | `elementalTaken` 乘 (1 + 强度) |
| `taunt` | 1 | `taunt` 加强度 |
| `weaken` | 0.3 | `atk` 乘 (1 − 强度) |
| `aspdDown` | −30 | `aspd` 加强度 |
| `defDown` | 0.3 | `def` 乘 (1 − 强度) |
| `resDown` | 20 | `res` 减强度 |

`stun` 带 `stun` 与 `no-block`，并取消攻击计时器。`sleep` 带 `sleep` 与 `no-block`。`bind` 带 `bind` 与 `no-move`。会取消攻击的内置状态见 [攻击](./07-attack.md)。`tremble` 只带同名标签：被挡住时这一拍不出手，冷却仍减少。`stealthOff` 只带 `stealth-off`，隐匿不再挡住选择。`overheal` 不带标签，治疗溢出时写下它的时长，结束时去掉对应护盾。见 [伤害](./05-damage.md)。
