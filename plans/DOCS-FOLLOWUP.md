- [1. 不受校验的字符串引用](#1-不受校验的字符串引用)
- [2. next 用例枚举](#2-next-用例枚举)
- [3. 文档示例类型检查的依赖布置](#3-文档示例类型检查的依赖布置)
- [4. 源码扫描用例改成 Biome 规则](#4-源码扫描用例改成-biome-规则)
- [5. 小的实现改进](#5-小的实现改进)
- [6. 文档小项](#6-文档小项)
- [延后](#延后)
- [约定：工作区工具包与库的独立性](#约定工作区工具包与库的独立性)

本文记录文档重构中发现、尚未解决的问题，按优先级排列。compat 的格式整理另行处理，不在本文。

- [x] 已完成　- [ ] 未开始或进行中

## 1. 不受校验的字符串引用

- [ ] 状态
- 问题：代码与数据里有一批以字符串写的路径或包名，没有任何检查：
  - `case-map/mapping.json` 的两条 `reason` 写文档路径（`docs/mission-core`、`docs/mission-core/06-damage.md`），违背「代码不依赖文档」。
  - `mapping.json` 的 `owner`（`app/server/content`、`app/server` 等）是自由文本，不核对包或目录是否存在。
  - `trace/rules.ts` 的 `location`（包内文件与符号）、`source`（上游文件）只是文字。
  - `docs/alliance/compat/trace.data.ts` 以 `../../../app/compat/upstream/trace/rules.ts` 导入 compat，`watch` 是同样的字符串。导入受 tsc 检查，`watch` 不受。
- 影响：目标改名或移动后引用静默失效，只能靠 grep 发现。
- 方案：
  - A. 去掉文档路径，改成文字或文档侧声明的 topic；`owner` 改为工作区包名（可加 `area`），用 `@alliance/shared/workspace` 的包列表校验；`location` 改为 `{ file, symbol }`，在 compat 的测试里核对文件与符号存在。
  - B. 保留字符串，加检查：`location` 的文件存在、`owner` 是工作区包、`docs/` 开头的路径报错。
  - trace 数据：compat 导出 `./trace`，docs 依赖 `@alliance/compat-upstream`，`watch` 由 `import.meta.resolve` 求出。
- 建议：先删掉两条文档路径并做 B 的检查，再逐步改成 A 的结构化字段。

## 2. next 用例枚举

- [ ] 状态
- 问题：`case-map/enumerate.ts` 的 `enumerateNext` 写死 `node_modules/vitest/vitest.mjs`，逐包串行运行 `vitest list`，只认包根目录下的三种配置文件名，所以 `deployment`（配置在 `client/config`）的用例枚举不到。
- 影响：`mapping.json` 与 trace 的 `next` 不能指向 `deployment` 的用例；vitest 的安装位置或入口文件名变化会让枚举失败。
- 方案：
  - A. 根目录 `vitest.config.ts` 用 `test.projects` 列出各包，一次 `vitest list` 枚举全部。
  - B. 用 vitest 的编程接口收集用例，不起子进程。
  - C. 至少改用 `pnpm exec vitest` 或解析包的 `bin`。
- 建议：A。

## 3. 文档示例类型检查的依赖布置

- [ ] 状态
- 问题：`docs/.vitepress/plugins/typecheck.ts` 在临时目录里手工搭 `node_modules`：逐个 symlink 工作区包、`docs` 的 `@types/node` 与各包自己的 peer 依赖，依赖 pnpm 的目录布局；`tsc` 写死为 `docs/node_modules/.bin/tsc`；`docsRoot`、`repoRoot` 按 `..` 推算。
- 影响：pnpm 布局或依赖声明一变，示例检查就会失败或漏检。
- 方案：临时目录放到 `docs/.cache/` 下，走正常的模块解析，docs 声明示例需要的依赖；`tsc` 用 `pnpm exec`；根目录用 `findWorkspaceRoot`。
- 建议：按此改。

## 4. 源码扫描用例改成 Biome 规则

- [ ] 状态
- 问题：两处边界检查写成了扫描源码的用例：`mission-core/test/determinism.spec.ts`（TS AST 扫描）、`mission-renderer/test/dependency.spec.ts`（正则扫描 import）。
- 影响：边界属于 lint，放在测试里更慢，正则扫描也可能漏判。
- 方案：determinism 改成 Biome GritQL 规则；dependency 改成各库 `biome.json` 的 `noRestrictedImports`。
- 建议：先做 dependency，GritQL 视规则表达能力再定。

## 5. 小的实现改进

- [ ] 状态
- [ ] `docs/.vitepress/config.ts` 的 `sectionTitle` 用正则从 `index.md` 取 `title`，改用 frontmatter 解析器。
- [ ] `app/contract/package.json` 的 `"./*.js"` 通配导出，改为显式列出。
- [ ] `case-map/check.ts` 自制 glob 转正则；规则按顺序先匹配者胜，重叠不报。文件部分可换 `picomatch`，并报告重叠的规则。
- [ ] `case-map/cli.ts` 手写参数解析，可换 `node:util` 的 `parseArgs`；提交号比较两向前缀都接受，应只接受短号是长号的前缀。
- [ ] `trace/rules.test.ts`、`case-map/mapping.test.ts` 用 `readFileSync(join(PACKAGE_ROOT, …))` 读 JSON，可改为 `import … with { type: 'json' }`，路径由 tsc 检查。

## 6. 文档小项

- [ ] 状态
- [ ] H1：`docs/alliance/index.md`（「盟约」）与 `docs/alliance/protocol/index.md`（「对局协议」）没有对应的单一包名，暂保留中文。
- [ ] `docs/alliance/data/03-resource.md` 的 `loadResourceStore` 示例为 `check:skip`：`@alliance/client` 没有 `exports`，要检查就需为文档改导出。
- [ ] `docs/mission-core/02`–`13` 的叙述，以及 `docs/mission-renderer/10-architecture.md` 的 systems 一列，未逐句对照源码核实。
- [ ] `app/client/shell/main.ts` 只有一行占位，`docs/alliance/01-quick-start.md` 无法写到实际开一局。

## 延后

- [ ] master 用例枚举改用真的 `node:test`。
  - 问题：`case-map/enumerate.ts` 用自制的 `node:test` 替身（`case-map/preload/*`，`module.register`）只记名字，要跟上 `node:test` 的 API 与命名规则；`t.test` 子用例记不到（上游有 4 个文件用到 `t.test` 或 `mock`）；每个测试文件一个子进程。
  - 方案：`node:test` 的 `run({ files, testNamePatterns })` 或 `--test-name-pattern` 不匹配任何用例，从报告里取跳过用例的全名，去掉替身与钩子。
  - 暂不做：需要 master 检出验证，且要先确认 Node 22 的报告事件带完整名字。

## 约定：工作区工具包与库的独立性

- 工作区工具在根目录 `shared/`，包名 `@alliance/shared`，私有。导出 `./workspace`（`findUp`、`findWorkspaceRoot`、`listWorkspacePackages`）、`./references`（`danglingReferences`）与 `./vitest`（各包共用的 `moduleTest`）。
- 包里是纯 JavaScript（`src/*.js`），类型在 `types/*.d.ts`，`check` 用 `checkJs` 按类型检查源码；不需要构建，没有自己的测试。vitest 与 VitePress 加载配置时把工作区包交给 Node 直接运行，所以不用 `--configLoader runner`，也不必预先构建。
- 库（`mission-core`、`mission-renderer`、`assets-catalog`、`assets-extractor`）只在 `vitest.config.ts` 里用它（devDependency）；源码与测试不得导入，由各库 `biome.json` 的 `noRestrictedImports` 检查，`vitest.config.ts` 用 override 放开。
- 应用包（`app/*`）与 docs 可以直接依赖它。
