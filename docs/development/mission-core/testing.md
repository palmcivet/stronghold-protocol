---
title: 黄金回放与源码扫描
description: mission-core 用固定场景的事件与快照摘要守住确定性，并扫描源码里的非确定调用与追溯标记。
---

# 黄金回放与源码扫描

## 黄金回放

`test/golden/scenario.ts` 列出固定场景，每个场景是一份规格、一组模块和拍数，覆盖攻击形状、投射物、状态、元素、位移、阻挡、技能、再部署、费用、泄漏。`test/golden/replay.spec.ts` 逐个运行，与 `test/golden/baseline.json` 比较。

每个场景记下：

| 字段 | 内容 |
| --- | --- |
| `ticks` | 推进的拍数 |
| `events` | 每拍 `drainEvents()` 的摘要 |
| `snapshots` | 每 30 拍一次 `snapshot()` 的摘要 |
| `finalSnapshot` | 最后一拍的快照摘要 |
| `result` | `result()` |

摘要由 `test/replay.ts` 计算：对象按键排序序列化（`canonical`），取 SHA-256 的前 16 个十六进制字符（`digest`）。逐拍记录，不一致时能看出从哪一拍开始。另一条用例检查每个场景确实触发了它要覆盖的事件，避免场景退化成空跑。

基线是本仓库自己的结果。行为有意改变时，确认差异后在 `mission-core` 内更新基线：

```sh
pnpm vitest run test/golden -u
```

## 确定性扫描

`test/determinism.spec.ts` 用 TypeScript 扫描器读取引擎源码（测试文件除外），出现以下写法即失败，报出文件与行号：

- 近似的 `Math` 函数：`acos`、`acosh`、`asin`、`asinh`、`atan`、`atanh`、`atan2`、`cbrt`、`cos`、`cosh`、`exp`、`expm1`、`hypot`、`log`、`log1p`、`log10`、`log2`、`pow`、`sin`、`sinh`、`tan`、`tanh`。改用 `kernel/math/`（见[确定性数学与整帧对齐](./kernel.md)）。
- 读时钟或系统熵：`Math.random`、`Date.now`、`performance.now`、`crypto.getRandomValues`、`crypto.randomUUID`，以及 `new Date`。随机数只来自战斗自己的发生器。
- 指数不是整数字面量的 `**`。

字符串、注释与模板字面量里的同名文字不算。

## 追溯扫描

`test/trace.spec.ts` 检查 `// TRACE: <种类>/<名字>` 标记与注释、测试名、报错文案，规则与标记表见[追溯标记](../trace.md)。

两个扫描共用 `test/source.ts`：列出包内源码，切分记号，跳过空白与注释。

## 路径别名

测试辅助用 `#test/*.js` 引用（指向 `test/*.ts`），例如 `#test/fixture.js`、`#test/replay.js`、`#test/golden/scenario.js`。
