---
title: 状态
description: applyStatus 按状态 id 施加一次效果。持续时间和强度可以逐次给出，同名状态按各自的叠法合并。
---

# 状态

```ts
applyStatus(unitId: string, statusId: string, application?: StatusApplication): void

interface StatusApplication {
  duration?: number
  value?: number
}
```

`duration` 是秒。缺省时用定义上的 `duration`，那个数是状态计时器的拍数；不大于 0 表示一直持续。传入 `Infinity` 也是一直持续。0、负数或非有限数这次施加不成立。正数秒换成拍数，至少 1 拍。`value` 缺省用定义上的 `valued`，再没有则是 0。

单位免疫，或这次被拒绝时，不施加。飞行单位和已经浮空的单位不再接受 `levitate`。施加成功后开始状态计时器。状态槽每拍调用 `onTick`。非永久的剩余拍数减 1，到 0 取下。取下时如果还记着一次更弱的续上，就换成那一次。

```ts
interface StatusDefinition {
  id: string
  flags: readonly string[]
  modifiers: readonly AttributeModifier[]
  immunity: readonly string[]
  immune?: string
  stackCap: number
  cancels: readonly string[]
  duration: number
  valued?: number
  scale?(value: number): readonly AttributeModifier[]
  onApply?(unitId: string, stacks: number, ctx: ContentContext): void
  onTick?(unitId: string, stacks: number, ctx: ContentContext): void
}
```

`immune` 是「挡住我时，单位 `immunity` 里的名字」。它可以和状态 id 不同。`immunity` 数组是这个状态在身上时，用来挡住别的状态的名字，名单用状态 id 或免疫名。

缺省叠法是刷新剩余时间并加一层，直到 `stackCap`。定义上的 `overlap` 可以换成别的叠法，返回空表示这次不生效。

## 免疫名

| 状态 id | 免疫名 |
| --- | --- |
| `freeze` | `frozen` |
| `fear` | `feared` |
| `tremble` | `feared` |
| `stun`、`sleep`、`silence`、`levitate`、`palsy` | 与状态 id 相同 |

## 叠法

`slow`、`fragile`、`artsFragile`、`physFragile`、`elemFragile`、`taunt`、`weaken`、`aspdDown`、`defDown`、`resDown` 同名取绝对值更高的一次。更强的盖过当前，一样强则留下更长的时长，更弱的等当前结束再续。

`palsy` 按 `value` 加层，缺省加 1，上限 3。

`resist` 的强度缩短控制状态的剩余时间，系数是 `1 - 抵抗`，抵抗不超过 0.95，缺省强度 0.5。被缩短的有 `stun`、`freeze`、`cold`、`sleep`、`fear`、`tremble`、`attract`、`levitate`、`bind`、`silence`、`disarm`、`sluggish`、`slow`。一直持续的不缩短。麻痹不缩短时间，`resist` 每 5 秒让它掉 1 层。

## 内置状态

`stun`、`freeze`、`cold`、`sleep`、`slow`、`sluggish`、`bind`、`fragile`、`artsFragile`、`physFragile`、`elemFragile`、`silence`、`fear`、`tremble`、`disarm`、`stealth`、`camou`、`reveal`、`invulnerable`、`levitate`、`palsy`、`taunt`、`weaken`、`aspdDown`、`defDown`、`resDown`、`unblockable`、`attract`、`resist`、`liftoff`、`isolated`。

`freeze` 施加在敌人身上时法抗减 15。`cold` 让攻速减 30。寒冷叠到身上已有的寒冷、并且没有免疫冻结时，再施加 `freeze`。两段都没有正数时长时，冻结用 3 秒；否则取较长的那段，永久则冻结也永久。`levitate` 在 `massLevel` 大于 3 且不是永久时，持续时间减半。

带强度的缺省值和修饰：

| id | 缺省强度 | 修饰 |
| --- | --- | --- |
| `slow` | 0.5 | `moveSpeed` 乘 (1 − 强度) |
| `sluggish` |  | `moveSpeed` 乘 0.2 |
| `bind` |  | `noMove`，`moveSpeed` 乘 0 |
| `fragile` | 0.3 | `dmgTaken` 乘 (1 + 强度) |
| `artsFragile` | 0.3 | `artsTaken` 乘 (1 + 强度) |
| `physFragile` | 0.3 | `physTaken` 乘 (1 + 强度) |
| `elemFragile` | 0.2 | `elementalTaken` 乘 (1 + 强度) |
| `taunt` | 1 | `taunt` 加强度 |
| `weaken` | 0.3 | `atk` 乘 (1 − 强度) |
| `aspdDown` | −30 | `aspd` 加强度 |
| `defDown` | 0.3 | `def` 乘 (1 − 强度) |
| `resDown` | 20 | `res` 减强度 |

`stun` 带 `noBlock`，并取消攻击计时器。会取消攻击的内置状态见 [攻击](./attack.md)。
