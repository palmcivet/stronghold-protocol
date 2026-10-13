# 文档维护说明

本文写给维护文档的人，不渲染成站点页面（`docs/.vitepress/config.ts` 的 `srcExclude`）。主要说明示例的类型检查插件 `docs/.vitepress/plugins/typecheck.ts`。

- 用法示例只从包的公开入口导入
- 讲解内部原理时可以给出内部签名，但要配合原理说明；这类引用包内源码或未导出类型的代码块，在围栏前一行写 `<!-- check:skip -->`
- 正文不写面向维护者的文档工具说明（类型检查、`check:skip` 等）；标记与检查规则见 `docs/README.md`

## 检查什么、什么时候检查

- 只做类型检查：代码块不运行，不比对输出，不生成悬停提示。
- `pnpm -C docs build`（`vitepress build`）在页面渲染后检查，有错误时构建失败。
- `pnpm -C docs dev`（`vitepress dev`）在页面渲染后约 1 秒检查，只在终端打印警告。
- 代码与测试不依赖文档；插件只读页面与工作区包，只往临时目录写文件。

## 检查哪些模块

在 `docs/.vitepress/config.ts` 里配置：

```ts
const examples = typecheck({
  modules: ["assets-catalog", "assets-extractor", "alliance", "mission-renderer", "mission-core"],
})
```

模块是 `docs/` 下的第一级目录。不在列表里的目录（如 `license`）不检查。

## 每个模块一个程序

每个模块单独一个临时目录、`tsconfig.json` 与 tsc 进程，并行运行。所以一个模块示例里的 `declare module` 只影响本模块，不会打坏别的模块。构建输出列出每个模块的程序数，例如：

```text
docs examples: 81 program(s) type-check (alliance 1, assets-catalog 27, ...)
```

## 代码块如何收集

- 只收集 ` ```ts ` 与 ` ```typescript ` 围栏，二者等价，页面统一写 ` ```ts `。`json`、`text`、`mermaid` 等不检查。
- 含 `import` 的代码块开始一个新程序（一个 `.ts` 文件）；不含 `import` 的代码块接在同一页上一个程序后面，可以直接用前面声明的名字。
- 同一程序内所有代码块的 `import` 提到文件顶部（多行 import 到模块路径结束）。
- 每个程序末尾补 `export {}`，按模块文件编译。

## 标记

- `<!-- check:skip -->`：写在围栏的前一行，这个代码块不检查。用于引用包内源码或未导出类型的原理讲解，以及暂时无法检查的示例。
- `// ---cut-after---`：代码块里这一行及其后的行照常检查，但不渲染。用于签名块末尾的 `satisfies` 检查行。
- `// ---cut---`：这一行及其前的行照常检查，但不渲染。用于只为通过检查而写的准备代码。
- 两个 cut 标记只对被检查的代码块生效；`check:skip` 的代码块原样渲染。
- 隐藏行的错误照样按原始 md 行号报出。

## 模块解析

- 只允许裸模块名：工作区包、它们的 peer 依赖（如 `three`，连同 `@types`）以及 Node 内置模块。
- 工作区包通过软链接放进临时目录的 `node_modules`，`customConditions: ["@wsde/source"]` 让它们解析到源码，不需要先构建包。
- 只能解析包的公开导出：深路径被 `exports` 拒绝，`#...` 导入在示例自己的包里解析而失败，包没导出的类型无法命名。
- tsconfig 继承仓库根的 `tsconfig.base.json`，`lib` 为 `es2024`、`dom`、`dom.iterable`，`types` 为 `node`。

## 签名块

API 页的签名本身也是被检查的代码：用 `export declare function` 与 `export interface` / `export type` 写签名，导入代码块没有声明的类型，在 `// ---cut-after---` 之后用 `satisfies` 要求包的实际导出满足页面写的签名：

```ts
import type { Battle } from "arknights-mission-core"
import * as mod from "arknights-mission-core"

export declare function runSteps(battle: Battle, steps: number): void

// ---cut-after---
mod.runSteps satisfies typeof runSteps
```

接口写两个方向，字段多了或少了都会失败：

```ts
;({}) as mod.BattleSpec satisfies BattleSpec
;({}) as BattleSpec satisfies mod.BattleSpec
```

## 错误输出

诊断从临时文件映射回页面行号：

```text
docs examples: 1 type error line(s)
  docs/mission-core/15-api.md:61:1: error TS2322: ...
```

格式是 `docs/<页面>.md:<行>:<列>`，后面是 tsc 的原始信息。

## 注意事项

- `declare module` 的作用范围是整个模块（同一模块的所有页面），不是单个页面。
- 示例不运行，运行期行为由包的测试保证。
- 正文不写面向维护者的说明（类型检查、`check:skip`、cut 标记等），读者只看到内容本身。
- 使用 `docs/node_modules/.bin/tsc`，当前为 TypeScript 7。
