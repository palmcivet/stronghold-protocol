# 文档维护说明

## 受众

文档面向三类读者；同一仓库内分区不必对每类读者都完整：

1. **终端用户**（玩家、服务器主）— 目前留空
2. **库用户**（集成 `mission-*` / `assets-*`）— 读各库的概览与「参考」；需要理解实现时也可读「维护」
3. **仓库 / 模块维护者**— 读「维护」

**盟约（alliance）目前仅面向维护者 / 内部**：内容按架构与系统组织，不单独做对外「参考」轴。库文档写库本身；应用如何组织数据、发布资源、连接服务端，写在盟约分区。

## 顶栏与分区

顶栏顺序（有 `docs/<name>/index.md` 才会出现）见配置里的 `SECTIONS`：

`alliance` · `mission-core` · `mission-renderer` · `assets-catalog` · `assets-extractor` · `license`

当前**没有** `guides`。分区名是文档身份，**不等于**工作区包边界：盟约一节覆盖 `alliance/` 下多个包；四个库各一节对应一个可发布库；许可是仓库级说明，不是包。

首页 `docs/index.md` 是站点入口，不进顶栏分区列表。

## 目录约定

所有可发布分区都在 `docs/<section>/` 下，且必须有 `index.md`（frontmatter `title` 即顶栏文案）。

### 库（mission-core、mission-renderer、assets-catalog、assets-extractor）

```text
docs/<module>/
  index.md                 # 概览：顶栏点击进入；侧栏不重复挂出
  reference/               # 「参考」— 无 index.md，组头不可点
    01-….md
  maintain/                # 「维护」— 无 index.md，组头不可点
    01-….md
```

- 顶栏打开模块 `index.md`（概览）。
- 侧栏两个可折叠组，顺序固定为 **参考** 再 **维护**；组头只作折叠标题，**没有链接**（磁盘上也不放组级 `index.md`，避免空壳总览页）。
- 组内页面可用数字前缀排序（如 `01-quick-start.md`）；前缀在侧栏文案里去掉。

### 盟约（alliance）

```text
docs/alliance/
  index.md                 # 概览：侧栏顶部「概览」
  maintain/                # 磁盘上仍归 maintain/，侧栏摊平，不出现「维护」组头
    01-quick-start.md
    02-architecture.md
    …
    client/                # 主题文件夹：有 index.md，侧栏可点进该主题
    data/
    protocol/
    compat/
```

- 全部正文目前放在 `maintain/` 下（含 `client` / `data` / `protocol` / `compat` 等主题目录）。
- 配置对盟约开启 `flattenMaintain`：侧栏**不得**出现「维护」；`maintain/` 的直接子页与主题文件夹提到与「概览」同级。
- 尚无 `reference/`。以后若要做对外参考，直接加 `docs/alliance/reference/` 即可与现有 `maintain/` 并存，不必搬迁已有维护文（双轴 IA、无需 reshuffle）。
- 主题文件夹**有** `index.md`，侧栏保留标题与链接（与不可点的参考/维护组头不同）。

### 许可（license）

```text
docs/license/
  index.md
  01-gpl.md
  02-notice.md
```

扁平，无 `reference/` / `maintain/`。该分区不做示例类型检查（`skipExamples`）。

### 预留：guides

终端用户指南的分区名预留为 `guides/`。未放置 `index.md` 前不进顶栏；加回时在 `SECTIONS` 中按产品需要插入，并单独约定其侧栏形态（不必强行套参考/维护）。

## 内容轴：参考与维护

| 轴 | 目录 | 写什么 |
| --- | --- | --- |
| **参考** | `reference/` | 稳定契约：对外 API、数据形状、命令、错误与术语。读者按条目查阅。 |
| **维护** | `maintain/` | 按架构 / 系统拆分：边界、内部结构、数据流、测试与改动注意点。 |

约定：

- **避免重复**：同一事实只在一处写全；另一轴用链接指向，不拷贝成第二份「保证摘要」。
- **不要**单独做 guarantees-summary / 「保证一览」类页面；契约写在参考条目里，实现约束写在维护文里。
- 内容若混杂契约与实现，**优先按维护（系统）切开**，再把稳定表面抽到参考；不要为了「两边都有」而对称灌水。
- 库用户以参考为主；学习者、排错者可以读维护。盟约当前只有维护轴，面向维护者。

正文是给读者看的内容：不在页面里解释文档工具（类型检查、`check:skip`、cut 标记等）；那些规则只写在本文。

## 侧栏如何生成

依赖 `vitepress-sidebar` 按目录扫描，再由 `config.ts` 整形。目录约定与配置选项对齐，而不是手写整棵侧栏。

对每个已发布分区，大致流水线是：

1. `generateSidebar`（`sectionOptions`）：按 `docs/<section>/` 扫描；`useFolderTitleFromIndexFile` / `useFolderLinkFromIndexFile` 让**有** `index.md` 的主题文件夹可点。
2. `withSidebarItems`：盟约等 `overview: true` 的分区把根 `index.md` 变成侧栏「概览」；库与许可则去掉根 index（顶栏已进入概览）。
3. `withGroupFolders`：把名为 `reference` / `maintain` 的项改成「参考」/「维护」，并**删掉 link**，成为不可点的折叠组。
4. `withFlattenedMaintain`：仅盟约（`flattenMaintain: true`）把「维护」组换成其子项。
5. `withReferenceBeforeMaintain`：若同时存在两轴，保证「参考」在「维护」前（插件按 link 排序时 `maintain/` 会排在前面，需要交换）。

新增分区：在 `SECTIONS` 增加一项并提供 `index.md`；需要摊平维护轴时设 `flattenMaintain: true`；无示例可检时设 `skipExamples: true`。新增库文档时默认采用「概览 + 参考 + 维护」目录即可，不必改整形函数。

## 本地命令

在仓库根：

```bash
pnpm -C docs dev      # 开发预览；示例类型错误只在终端警告
pnpm -C docs build    # 生产构建；示例类型错误会使构建失败
pnpm -C docs preview  # 预览构建结果
```

## 示例类型检查

插件：`docs/.vitepress/plugins/typecheck.ts`。只做类型检查：代码块不运行、不比对输出、不生成悬停提示。

- `pnpm -C docs build` 在页面渲染后检查，有错误则构建失败。
- `pnpm -C docs dev` 在页面渲染后约 1 秒检查，只在终端打印警告。
- 代码与测试不依赖文档；插件只读页面与工作区包，只往临时目录写文件。

### 检查哪些模块

由 `SECTIONS` 派生：未标 `skipExamples` 的已发布分区会进入 `typecheck({ modules })`。模块名即 `docs/` 下第一级目录。`license` 不检查。

### 每个模块一个程序

每个模块单独临时目录、`tsconfig.json` 与 tsc 进程，并行运行。一个模块示例里的 `declare module` 只影响本模块。构建输出会列出每个模块的程序数，例如：

```text
docs examples: 81 program(s) type-check (alliance 1, assets-catalog 27, ...)
```

### 代码块如何收集

- 只收集 ` ```ts ` 与 ` ```typescript ` 围栏（等价；正文统一写 ` ```ts `）。`json`、`text`、`mermaid` 等不检查。
- 含 `import` 的代码块开始一个新程序；不含 `import` 的接在同一页上一个程序后，可直接用前面声明的名字。
- 同一程序内所有 `import` 提到文件顶部。
- 每个程序末尾补 `export {}`，按模块文件编译。

### 标记

- `<!-- check:skip -->`：写在围栏前一行，该块不检查。用于引用包内源码或未导出类型的原理讲解，以及暂时无法检查的示例。
- `// ---cut-after---`：该行及其后照常检查，但不渲染（常用于签名块末尾的 `satisfies`）。
- `// ---cut---`：该行及其前照常检查，但不渲染（只为通过检查的准备代码）。
- 两个 cut 只对被检查的代码块生效；`check:skip` 的块原样渲染。
- 隐藏行的错误仍按原始 md 行号报出。

### 模块解析

- 只允许裸模块名：工作区包、它们的 peer（如 `three`，连同 `@types`）以及 Node 内置模块。
- 工作区包经软链接进入临时 `node_modules`，`customConditions: ["@wsde/source"]` 解析到源码，无需先构建包。
- 只能解析包的公开导出：深路径会被 `exports` 拒绝；`#...` 子路径导入会失败；未导出类型无法命名。
- tsconfig 继承仓库根 `tsconfig.base.json`，`lib` 为 `es2024`、`dom`、`dom.iterable`，`types` 为 `node`。

### 签名块

API 页的签名本身也是被检查的代码：用 `export declare function` 与 `export interface` / `export type` 写签名；在 `// ---cut-after---` 之后用 `satisfies` 断言包的实际导出满足页面签名：

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

### 错误输出

诊断从临时文件映射回页面行号：

```text
docs examples: 1 type error line(s)
  docs/mission-core/reference/15-api.md:61:1: error TS2322: ...
```

格式为 `docs/<页面>.md:<行>:<列>`，后接 tsc 原始信息。

### 注意事项

- 用法示例只从包的公开入口导入。
- 讲解内部原理时可给出内部签名，并配合原理说明；引用包内源码或未导出类型的块加 `<!-- check:skip -->`。
- `declare module` 的作用范围是整个模块（该模块下所有页面），不是单个页面。
- 示例不运行；运行期行为由包的测试保证。
