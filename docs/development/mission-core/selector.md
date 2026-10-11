---
title: 选择器
description: select 和 unitsInRange 接受一个选择器 id，或按顺序叠起来的 id 列表。
---

# 选择器

```ts
select(selectorId: string | readonly string[], unitIds: readonly string[]): readonly string[]
unitsInRange(unitId: string, selectorId: string | readonly string[]): readonly string[]
hitRect(unitId: string): HitShape
```

参数是一个字符串或 `readonly string[]`。单个字符串和只含它的数组相同。`"all"` 不用拆开。未知 id 抛出 `UnknownRegistrationError`，`registry` 是 `selector`。

按给出的顺序走。`kind` 不是 `sort` 的做筛选，不是 `filter` 的留到后面排序。只有筛选时保持原来的先后。有排序时按给出的顺序比较，第一个不是 0 的结果决定谁在前。写在前面的排序键优先。

`select` 只处理调用方给出的名单。`unitsInRange` 先收集攻击范围内的单位，再加上 `blocking` 里的单位，以及 `blockedBy` 指向查询者的单位。查询期间用来源记住这个单位。攻击范围按朝向 `RIGHT` 填写，查询时转到单位朝向，越出棋盘的格子不算。属性 `rangeExtend` 大于 0 时，先在面向 `RIGHT` 的每一行、最远那一列后再加这么多格，然后再旋转。

`hitRect` 在没有大体型时返回所站的一格，`kind` 为 `tile`，宽高都是 1。有 `HitArea` 时 `kind` 为 `rect`。距离用站位或矩形边计算。

快照不调用选择器。

## 登记

```ts
interface SelectorDefinition {
  id: string
  kind?: "filter" | "sort"
  filter(unitId: string, ctx: ContentContext): boolean
  compare(left: string, right: string, ctx: ContentContext): number
}
```

`all` 没有 `kind`。筛选留下全部，比较结果是 0。

## 筛选

| id | 留下谁 |
| --- | --- |
| `enemy` / `ally` | 该阵营、在场、未倒地、未路线隐藏、生命大于 0，且不是查询者自己 |
| `fly` | 非飞行的留下。飞行单位只有查询者带 `can-hit-fly` 标签或属性 `canHitFly` 时留下 |
| `stealth` | 隐匿且未显形时，敌人要已经有阻挡者，友方要正阻挡着查询者 |
| `camouflage` | 迷彩挡住敌方查询者，挡不住正被这个单位阻挡的敌人 |
| `area` | 在场、未倒地、生命大于 0，并去掉不可选、睡眠、隐匿。地面敌人够不到起飞 |
| `liftoff` | 地面敌人够不到带 `liftoff` 的目标 |
| `sleep` | 去掉睡眠 |
| `untargetable` | 去掉不可选 |
| `isolated` | 孤立单位只留给另一阵营。没有查询者时不留 |
| `range` | 在转到朝向后的攻击范围里，或与查询者有阻挡关系 |

飞行指 `motion` 为 `FLY`，或敌人带有 `float`、`levitate`。

## 排序

| id | 谁在前 |
| --- | --- |
| `block` | 和查询者有阻挡关系的 |
| `priority` | 按查询者的 `targetPriority`。空字符串和其他未列出的字符串不改顺序 |
| `taunt` | 嘲讽高的 |
| `aggro` | `aggroSeq` 大的。缺省按入场先后，越晚越大 |
| `remaining` | 剩余路程短的。没有路线时路程是 0 |
| `hp-ratio` | 生命比例低的 |
| `defense` | 防御低的 |
| `distance` | 离查询者近的 |
| `spawn` | 入场序号小的 |

`priority` 认识的 `targetPriority`：`fly` 飞行在前，`ground` 地面在前，`defense` 防御低的在前，`high-defense` 防御高的在前，`hp-ratio` 生命比例低的在前，`distance` 近的在前，`farthest` 远的在前。

攻击使用的默认链见 [攻击](./attack.md)。
