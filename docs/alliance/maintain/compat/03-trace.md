---
title: 追溯标记
description: 引擎规则的出处、依据与核对状态，以及锁住每条规则的用例。
---

<script setup>
import { data } from './trace.data.ts'
const core = data.filter((row) => row.package === 'mission-core')
const renderer = data.filter((row) => row.package === 'mission-renderer')
</script>

# 追溯标记

代码、注释、测试名与报错只写当前代码在做什么。规则或数值需要指向外部出处时，出处、依据与核对状态集中记在 `alliance/compat/upstream/trace/rules.ts`，本页由它渲染（`trace.data.ts`）。引擎包的源码与测试不写追溯标记，也不引用这份数据或本页。

| 种类 | 含义 |
|---|---|
| `assumed` | 沿用参考实现中标为假定的规则或数值，尚无官方资料印证 |
| `source` | 行为或数值的出处：参考实现的文件与设计记录，或官方数据字段 |

每条记录写明规则在包里的位置（`location`：`{ file, symbol? }[]`，`file` 相对包根）、上游出处，以及在 next 里锁住它的用例（`next`，写法与 case-map 一致：`<包>/<测试文件>::<用例名>`），可选写出 `inventory.json` 里对应的上游用例（`upstreamCases`）。找不到锁住它的用例时 `next` 留空并写明原因（`gap`）。本页由 `@alliance/compat-upstream/trace` 导出的表渲染。

## 检查

`alliance/compat/upstream/trace/rules.test.ts` 检查：

- 数据符合 schema，id 形如 `assumed/…` 或 `source/…` 且不重复；`next` 为空时必须有 `gap`。
- `location` 的每个 `file` 在对应包下存在；若有 `symbol`，TypeScript 扫描器能对上（注释跳过）：无点号的是标识符或字符串字面量，有点号的是点号链，或 interface / class / enum / type 声明上的成员。
- `next` 里的用例都属于记录所在的包，并且都能用 case-map 的枚举（`vitest list`）找到。
- `upstreamCases` 都在 `case-map/inventory.json` 里。

在 `alliance/compat/upstream` 内运行：

```sh
pnpm test
```

## mission-core

<table>
<thead><tr><th>id</th><th>规则</th><th>位置</th><th>来源</th><th>依据</th><th>核对</th><th>锁定用例</th></tr></thead>
<tbody>
<tr v-for="row in core" :key="row.id">
<td><code>{{ row.id }}</code></td>
<td v-for="(cell, index) in row.cells" :key="index" v-html="cell"></td>
<td>
<ul v-if="row.next.length > 0"><li v-for="id in row.next" :key="id"><code v-html="id"></code></li></ul>
<p v-else v-html="'未锁定：' + row.gap"></p>
<details v-if="row.upstreamCases.length > 0"><summary>上游用例</summary><ul><li v-for="id in row.upstreamCases" :key="id"><code v-html="id"></code></li></ul></details>
</td>
</tr>
</tbody>
</table>

## mission-renderer

<p v-if="renderer.length === 0"><code>mission-renderer</code> 目前没有记录；需要时在 <code>rules.ts</code> 里补一条 <code>package: 'mission-renderer'</code> 的记录。</p>
<table v-else>
<thead><tr><th>id</th><th>规则</th><th>位置</th><th>来源</th><th>依据</th><th>核对</th><th>锁定用例</th></tr></thead>
<tbody>
<tr v-for="row in renderer" :key="row.id">
<td><code>{{ row.id }}</code></td>
<td v-for="(cell, index) in row.cells" :key="index" v-html="cell"></td>
<td><ul><li v-for="id in row.next" :key="id"><code v-html="id"></code></li></ul></td>
</tr>
</tbody>
</table>
