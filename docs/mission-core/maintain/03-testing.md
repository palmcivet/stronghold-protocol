---
title: 黄金回放与源码扫描
description: 怎么跑黄金回放与扫描、怎样读失败、何时更新基线；确定性与边界由 Biome 规则守住。
---

# 黄金回放与源码扫描

维护演算确定性时，用黄金回放锁住场景摘要，用 Biome 规则挡住非确定调用与玩家、房间字面量，用导出导入往返锁住存档边界。下面按系统写：怎么跑、失败怎么看、何时改。

## 怎么跑

在 `mission-core` 内：

| 命令 | 做什么 |
| --- | --- |
| `pnpm test` | 全部用例：黄金回放、导出导入、边界类型检查等（`*.test.ts` / `*.spec.ts`） |
| `pnpm lint` | Biome，含确定性与边界的 Grit 插件 |
| `pnpm check:test` | `tsc -p tsconfig.test.json`（事件表字段名的编译期边界也在此） |
| `pnpm perf` | 黄金场景基准（`*.bench.ts`），不设门槛 |

测试辅助用 `#test/*.js` 引用（指向 `test/*.ts`），例如 `#test/fixture.js`、`#test/replay.js`、`#test/golden/scenario.js`。

## 黄金回放

`test/golden/scenario.ts` 列出固定场景：每个是一份规格、一组模块和拍数，覆盖攻击形状、投射物、状态、元素、位移、阻挡、技能、再部署、费用、泄漏。`test/golden/replay.spec.ts` 逐个运行，与 `test/golden/baseline.json` 比较。

每个场景记下：

| 字段 | 内容 |
| --- | --- |
| `ticks` | 推进的拍数 |
| `events` | 每拍 `drainEvents()` 的摘要 |
| `snapshots` | 每 30 拍一次 `snapshot()` 的摘要 |
| `finalSnapshot` | 最后一拍的快照摘要 |
| `result` | `result()` |

摘要由 `test/replay.ts` 计算：对象按键排序序列化（`canonical`），取 SHA-256 的前 16 个十六进制字符（`digest`）。

### 怎么跑

```sh
pnpm test -- test/golden
```

### 失败怎么看

- 与 `baseline.json` 不一致时，快照差异里是整份回放 JSON。`events` 按拍排列，可看出从哪一拍开始分叉
- 另有「场景必须触发某类事件」的用例：若场景退化成空跑，对应事件计数为 0 会失败

### 何时更新基线

基线是本仓库自己的结果。行为有意改变时，确认差异后在 `mission-core` 内更新：

```sh
pnpm vitest run test/golden -u
```

## 确定性扫描

`biome.json` 挂上 Grit 插件 `lint/determinism.grit`，检查引擎源码（测试文件除外）。字符串、注释与模板字面量里的同名文字不算。

挡住的写法：

- 近似的 `Math` 函数：`acos`、`acosh`、`asin`、`asinh`、`atan`、`atanh`、`atan2`、`cbrt`、`cos`、`cosh`、`exp`、`expm1`、`hypot`、`log`、`log1p`、`log10`、`log2`、`pow`、`sin`、`sinh`、`tan`、`tanh`。改用 `kernel/math/`（见[确定性数学](./01-architecture.md#确定性数学)）
- 读时钟或系统熵：`Math.random`、`Date.now`、`performance.now`、`crypto.getRandomValues`、`crypto.randomUUID`，以及 `new Date`。随机数只来自战斗自己的发生器
- 指数不是整数字面量（`2`、`2_0`）的 `**`，以及 `**=`。`vec.Math.pow` 这种更长的属性链不算 `Math.pow`

### 怎么跑

```sh
pnpm lint
```

### 失败怎么看

Biome 报出文件与违规写法。改成 `kernel/math/` 或战斗随机数后重跑。

### 何时改规则

只有引擎边界本身要放宽或收紧时，才改 `lint/determinism.grit`；平时修的是源码，不是规则。

## 边界扫描

`lint/boundary.grit` 同样挂在 `biome.json` 上，测试文件除外。核心只认单位的 `owner`，不认玩家与房间。标识符与字符串字面量里：

- 以 `player` / `Player` 开头，或在小写字母后接驼峰 `Player`（如 `myPlayer`）
- 以 `room` / `Room` 开头，或以下划线再接 `room`（如 `_room`）
- 字符串在引号后直接以这些词开头，或在非字母数字字符之后出现 `player` / `Player`

注释与模板字面量不算。连字符拆出来的词、以及不在首词的 `room`（如 `theRoom`、`playRoom`）不报。

同一份 `test/boundary.spec.ts` 还在编译期检查事件表：事件名、cue 种类，以及事件数据里向下 4 层的字段名（数组看元素）都不能含 player 或以 room 开头，经声明合并加入同一程序的事件一并检查；有违规时 `tsc -p tsconfig.test.json` 报出字段名。

### 怎么跑

```sh
pnpm lint
pnpm check:test
```

### 失败怎么看

- Grit：Biome 指出标识符或字面量
- 类型检查：`check:test` 报出事件表里违规的字段名

### 何时改规则

只有「核心是否允许某类命名」的边界变化时，才改 `lint/boundary.grit` 或事件表类型断言。

## 导出与导入

`test/battle/archive.spec.ts` 让每个黄金场景推进一半后 `export()`，经 JSON 往返（非有限数换成标记再换回）后 `createBattle(spec, modules, archive)` 继续推进，事件摘要、快照摘要、结果与账本都要与不中断推进一致。

### 怎么跑

```sh
pnpm test -- test/battle/archive.spec.ts
```

### 失败怎么看

某场景的中途恢复摘要与直跑不一致时，对照该场景从半程起的事件摘要与最终快照。编码表与 `exportWorld` / `importWorld` 边界见 [World 与状态模型](./02-world-state.md#导出与导入)。

### 何时改用例

改了导出编码或单位记录归档格式之后，先确认差异来自有意变更，再改断言或夹具；不要为了「先绿」而放宽往返一致性。

## 性能观察

`perf/golden.bench.ts`：每个黄金场景从头推进 600 帧算一次，用 `bench.compare` 交替各跑 20 次以上，打印每个场景的 hz、平均毫秒数与分位数，不设门槛。

`pnpm test` 只收 `*.test.ts` / `*.spec.ts`，不跑基准。`*.bench.ts` 不进构建（`tsconfig.json` 排除），类型检查走 `tsconfig.test.json`。基准经源码条件引用 `arknights-mission-core`，模块导出的读取有一层包装，数字只用于前后对比。

### 怎么跑

```sh
pnpm perf
```

（即 `vitest bench --run --reporter=verbose`。）

### 失败怎么看

基准默认不失败；若命令本身报错，先看导入与类型是否通过 `pnpm check:test`。

### 何时改基准

场景集合或推进帧数有意调整时，改 `perf/golden.bench.ts`；不要把偶然波动写进门槛——当前没有门槛。
