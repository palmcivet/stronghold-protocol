---
title: 伤害
description: dealDamage 按已登记的伤害步骤结算。流失、治疗和元素槽走各自的入口。
---

# 伤害

```ts
interface DamageInfo {
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
}
```

`dealDamage(info)` 走伤害步骤。`kind` 收成 `physical`、`arts`、`true`、`elemental`、`element`。`phys` 记成 `physical`。

目标不存在或已倒地时不进入步骤。进入之前，直接授予的 `invulnerable` 会挡下。沉睡会挡下，除非 `ignoreSleep`，或来源带有 `hit-sleep`。起飞会挡下来源是地面敌人的一击，除非 `ignoreSelect`、`sourceless`，或来源自己在飞行。起飞只在命中事件之前查一次。

不是预览、且种类不是 `element` 时，先送出可拦截的 `hit`。订阅者可以改 `amount`、`kind`、`cancel`、`mul`。`cancel` 为真则不再进入步骤。

## 步骤

按 `priority` 从小到大。内置步骤：

| id | priority | 行为 |
| --- | --- | --- |
| `element` | 100 | `kind` 为 `element` 时按 `element` 标识进槽 |
| `dodge` | 150 | 物理和法术按闪避掷一次 |
| `mitigate` | 200 | 防御、法抗、元素抗性减伤 |
| `multiplier` | 300 | 乘上来源和目标的伤害乘区 |
| `boss-limit` | 400 | `hitLimit` 打开且达到限伤时整段取消 |
| `shield` | 600 | 先扣次数护盾，再扣数值护盾 |
| `hp` | 1000 | 写当前生命 |

`cancel` 为真，或种类仍是 `element` 时，后面的步骤不再写生命。模块用别的优先级插在这些 id 之间。同名再登记会换掉原来的步骤。

### 元素进槽

没有 `element` 标识时数额变成 0。目标没有生命、正在爆发、带 `burst-lock`，或这个槽已锁定时，数额变成 0。不是预览时送出可拦截的 `element-hit`。种类被改离 `element` 后会再送出 `hit`，后面的步骤按新种类继续。

否则按抗性收成进槽的量。单位带了 `elementRes` 就用它，没有则用元素定义上的 `resistance`。抗性按 0 到 100 的百分数，系数是 `max(0.05, 1 - 抗性 / 100)`。进槽量是数额 × 乘数 × `elemTaken` × 这个系数。预览不进槽。蓄满则爆发。

### 闪避

预览、已经取消，或种类是 `element` 时不闪。`canDodge` 缺省时，只有物理和法术会闪。法术看 `dodgeArts`，其他种类看 `dodgePhys`。骰子小于这个概率则数额变成 0 并取消。多个闪避来源先合成一个概率：1 减去各来源落空概率的乘积。只有一条且只有一层时，用原来的概率。

### 减伤

减伤之后至少保留原伤害的 0.05。物理减去有效防御。法术按有效法抗的百分比减。`elemental` 按 `elementalRes` 减。真实和未知种类保持原值。穿透把这一击自己的无视和来源属性加在一起。`sourceless` 不用来源的穿透和乘区。

带 `hit-count` 时，这一下变成 1，并跳过减伤、乘区和首领限伤。只带 `hit-count-arts` 时，物理变成 0，其他种类变成 1。

### 乘区

先乘 `mul`，缺省 1。除了 `elemental`，再乘目标的 `dmgTaken`。有来源时乘 `dmgDealt`，物理再乘 `physDealt`，法术再乘 `artsDealt`。目标侧物理乘 `physTaken`，法术乘 `artsTaken`，`elemental` 乘 `elementalTaken`，其余乘 `trueTaken`。

### 首领限伤

阈值是 300000。单位打开了 `hitLimit`，且 `ceil(数额)` 达到这个值时，数额变成 0 并取消。

### 护盾和生命

护盾先看状态上的次数，再看属性 `shieldHits`。命中次数的护盾直接吃掉这一下。然后按状态上的数值护盾和属性 `shield` 扣。

生命步骤把当前 `hp` 减去数额。会扣到 0 时先送出 `fatal`。`prevented` 为真时，生命留在 1 和最大生命里较小的那个。否则写下剩余生命，再送出 `damaged`。生命不大于 0 时倒地：标成已倒地、离场，送出 `downed`。有部署策略时，落点用 `downedTile`，坐标写成这个格子，事件里带上坐标和 `canStand`。内置策略 `deploy` 的落点见 [模块](./module.md)。

## 预览

```ts
interface DamagePreview {
  sourceId: string
  targetId: string
  amount: number
  kind: string
  steps: readonly string[]
}
```

`previewDamage` 走同一串步骤。它不掷闪避，不写生命，不扣护盾，不填元素槽，不发事件。`steps` 是跑过的步骤 id。

## 流失

`loseHp(unitId, amount)` 不进伤害步骤，不减防御和法抗，不送出 `damaged`。数额不是正数，或目标已倒地时不做。`hitLimit` 打开且 `ceil(数额)` 达到 300000 时，这一整段取消。

其余情况扣当前生命。致命时先送出 `fatal`，再送出 `loss`。没致命时只送出 `loss`。

## 治疗

`heal(unitId, amount, options?)` 要求数额是正数。目标带 `no-heal` 时，只有 `self` 或来源就是目标才治。带 `heal-free` 时，`regen` 或 `ignoreHealFree` 才治。治疗量是数额 × 来源的 `healingDealt` × 目标的 `healingTaken`。没有来源时 `healingDealt` 按 1。写回的生命不超过最大生命。`overheal` 把超出的部分转成护盾，这份护盾不超过最大生命，并施加 `overheal` 状态。`overhealDuration` 是秒，缺省一直留着。状态结束时，还没被打掉的这份护盾从单位上减去。送出 `heal`。

## 元素

```ts
interface ElementDefinition {
  id: string
  cap: number
  resistance: number
  onBurst?(unitId: string, ctx: ContentContext, sourceId?: string): void
}
```

内置标识是 `burn`、`neural`、`apoptosis`、`erosion`、`necrosis`。槽上限先看单位基础属性 `gaugeMax`，没有则用定义上的 `cap`。内置定义的 `cap` 是 1000。

`kind` 为 `element` 的伤害写入 `info.element` 这一个槽。`addElement(unitId, elementId, amount)` 把数量直接加进这个标识的槽。蓄满后这个槽锁定，并调用 `onBurst`。爆发是无来源伤害，不吃填槽者的伤害乘算和穿透，击杀仍记在填槽者上。爆发期间该单位任何元素都不再进槽。内置的五种会施加爆发状态。冷却结束时该单位的槽归零。
