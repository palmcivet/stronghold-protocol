---
title: 确定性数学与整帧对齐
description: kernel/math 的逐位确定的数学函数，kernel/tick 的节拍常量、倒计时与到达判断。
---

# 确定性数学与整帧对齐

同一份规格在不同 JavaScript 引擎上要走出同一场战斗。规范允许 `Math.hypot`、`Math.pow`、`Math.sin` 等返回近似值，各引擎末位不同，所以引擎代码不调用它们，改用 `kernel/math/` 的实现；按拍累加的浮点残差由 `kernel/tick/` 的容差吸收。

包内用路径别名引用：`#kernel/math/<文件>.js`、`#kernel/tick/index.js`。

## kernel/math

| 文件 | 函数 | 结果 |
| --- | --- | --- |
| `hypot.ts` | `hypot(x, y)` | `√(x² + y²)`。输入超出 2^±500 时先按 2 的幂缩放，避免溢出与下溢；任一参数为 ±∞ 时为 +∞，否则有 NaN 时为 NaN |
| `powi.ts` | `powi(x, n)` | `x` 的整数次幂。用双双精度的平方乘，结果正确舍入（下溢边缘除外）；`n` 不是整数时抛 `RangeError` |
| `trig.ts` | `sin(x)`、`cos(x)`、`atan2(y, x)` | fdlibm 的算法：范围约简加多项式 |
| `float.ts` | `highWord`、`lowWord`、`fromWords`、`powerOfTwo` | 读写双精度数的高低 32 位，精确构造 2 的幂 |

这些函数只用 IEEE 754 规定正确舍入的运算（加减乘除、`Math.sqrt`、`Math.floor` 等），每个引擎得到同一个比特。用例固定了一组输入的结果摘要，任一比特变化都会失败；另有 `fast-check` 的性质用例：`powi` 与 `hypot` 对 BigInt 精确值正确舍入或在 1 ulp 内，`sin`、`cos`、`atan2` 保持对称性与恒等式，特殊值符合语言规范。

引擎里的整数次幂写 `powi(x, n)`；`x ** n` 只允许指数是整数字面量。

## kernel/tick

| 名字 | 值或签名 | 含义 |
| --- | --- | --- |
| `TICK` | `1 / 30` | 一拍的游戏秒数 |
| `READY_EPSILON` | `1e-9` | 拍对齐的容差，远大于按拍累加的残差，远小于一拍 |
| `countdown(remaining, dt)` | `number` | 倒计时走过 `dt` 后的剩余，剩余在容差以内记为 0 |
| `reached(value, target)` | `boolean` | 累计量是否到达目标，差距在容差以内算到达 |

时长是整拍数时，倒计时正好走那么多拍：1 秒走 30 拍，攻击间隔 `bat × 100 / aspd` 走 `⌈30 × 间隔⌉` 拍；不在拍网格上的时长在越过 0 的那一拍结束（1.25 秒走 38 拍）。300 次加 `1/30` 到达 10。

使用的地方：攻击计时的冷却与前摇（[攻击](./attack.md)），技力与充能、手动技能的就绪时刻（[技能](./skill.md)），持续技能的剩余时间，充能与装填的间隔（[计时](./timer.md)）。
