---
title: 选择器
description: select 和 unitsInRange 接受一个选择器 id，或按顺序叠起来的 id 列表。
---

# 选择器

**选择器**按 id 注册，负责从单位里筛选与排序。一次查询可以给一个 id，也可以给按顺序叠起来的一组 id。

入口有三个：

- `select(selectorId, unitIds)`：筛选并排序给出的名单，没有查询者
- `unitsInRange(unitId, selectorId)`：以这个单位为查询者，先收集范围内的单位
- `hitRect(unitId)`：受击范围

参数是一个字符串或 `readonly string[]`。单个字符串和只含它的数组相同。`"all"` 不用拆开。未知 id 抛出 `UnknownRegistrationError`，`registry` 是 `selector`。

- 按给出的顺序走。
- `kind` 不是 `sort` 的做筛选，不是 `filter` 的留到后面排序。
- 只有筛选、没有排序时，保持原来的先后。
- 有排序时按给出的顺序比较，第一个不是 0 的结果决定谁在前。
- 写在前面的排序键优先。

- `select` 只处理调用方给出的名单。
- `unitsInRange` 先收集攻击范围内的单位，再加上 `blocking` 里的单位、`blockedBy` 指向查询者的单位，以及挡住查询者的单位。
- 没有攻击范围的敌人因此只打挡住它的单位。
- 查询期间用来源记住这个单位。
- 攻击范围按朝向 `RIGHT` 填写，查询时转到单位朝向，越出棋盘的格子不算。
- 属性 `rangeExtend` 与 `rangeExtendBase` 之和大于 0 时，先在面向 `RIGHT` 的每一行、最远那一列后再加这么多格（向下取整，最多 32），然后再旋转。
- 内容用 `setExtraRange(unitId, tiles)` 加进去的绝对格子（越出棋盘的丢掉）也算攻击范围，换位置、换范围之后都留着，`null` 清掉；它们不进技能触发的初始范围。

`hitRect` 在没有大体型时返回所站的一格，`kind` 为 `tile`，宽高都是 1。有 `HitArea` 时 `kind` 为 `rect`。距离用站位或矩形边计算。

快照不调用选择器。

## 登记

```ts
import type { MissionModule } from "arknights-mission-core"

export const lowHp: MissionModule = {
  id: "low-hp",
  install(reg) {
    reg.registerSelector({
      id: "low-hp:below-half",
      kind: "filter",
      filter: (unitId, ctx) => {
        const unit = ctx.unit(unitId)
        if (unit === null) {
          return false
        }
        return unit.hp * 2 < unit.maxHp
      },
      compare: () => 0,
    })
  },
}
```

`SelectorDefinition` 有 `id`、可选的 `kind`，以及 `filter(unitId, ctx, query)` 与 `compare(left, right, ctx, query)`。`query.origin` 是查询者，`select` 时为 `null`。

`all` 没有 `kind`。筛选留下全部，比较结果是 0。

## 筛选

| id | 留下谁 |
| --- | --- |
| `enemy` / `ally` | 该阵营、在场、未倒地、未路线隐藏、生命大于 0，且不是查询者自己 |
| `foe` | 与 `enemy` / `ally` 同样的在场条件；查询者对面阵营的，加上同阵营里带 `ally-target` 标签的 |
| `fly` | 非飞行的留下。飞行单位只有查询者带 `can-hit-fly` 标签或属性 `canHitFly` 时留下 |
| `stealth` | 隐匿且未显形时，敌人要已经有阻挡者，友方要正阻挡着查询者 |
| `camouflage` | 迷彩挡住敌方查询者，挡不住正被这个单位阻挡的敌人 |
| `area` | 在场、未倒地、生命大于 0，并去掉不可选、睡眠、隐匿。地面敌人够不到起飞 |
| `liftoff` | 地面敌人够不到带 `liftoff` 的目标 |
| `sleep` | 去掉睡眠 |
| `untargetable` | 去掉不可选 |
| `isolated` | 孤立单位只留给另一阵营。没有查询者时不留 |
| `range` | 在转到朝向后的攻击范围里，或与查询者有阻挡关系（包括挡住查询者的单位） |

飞行指 `motion` 为 `FLY`，或敌人带有 `float`、`levitate`。带 `groundbind` 的敌人不算飞行，除非同时带 `levitate`。

## 排序

| id | 谁在前 |
| --- | --- |
| `ally-target` | 对面阵营的在前，同阵营的（友方目标）在后 |
| `block` | 和查询者有阻挡关系的 |
| `priority` | 按查询者的 `targetPriority`。空字符串和其他未列出的字符串不改顺序 |
| `taunt` | 嘲讽高的 |
| `aggro` | `aggroSeq` 大的。缺省按入场先后，越晚越大。用部署策略时按部署先后重排：开场按开场名单，开场时随干员放进来的召唤物在名单之后，战斗中放进来的友方和再部署的友方排到最后 |
| `remaining` | 剩余路程短的：这一段按已规划的路点量，之后的地面段按平滑流场的长度（飞行段量直线），出现段把起点挪到出现的位置。没有路线时路程是 0 |
| `hp-ratio` | 生命比例低的 |
| `defense` | 防御低的 |
| `distance` | 离查询者近的 |
| `spawn` | 入场序号小的 |

`priority` 认识的 `targetPriority`：`fly` 飞行在前（友方的 `block` 排序把范围里的飞行敌人和自己挡着的敌人看成同级，所以优先攻击空中单位的干员挡着地面敌人时也先打飞行的），`ground` 地面在前，`defense` 防御低的在前，`high-defense` 防御高的在前，`hp-ratio` 生命比例低的在前，`distance` 近的在前，`farthest` 远的在前。

攻击使用的默认链见 [攻击](./08-attack.md)。
