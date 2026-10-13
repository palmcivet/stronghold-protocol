---
title: 用例对照表
description: master 的每条测试用例在 next 里的去向，以及检查对照表的命令。
---

# 用例对照表

`alliance/compat/upstream/case-map/` 记录 master 的每条测试用例在 next 里的去向，并检查对照表与两边的用例清单一致。

## 文件

- `mapping.json`：人工维护的对照：`upstream`（仓库与提交号）、`caseByCase`、`rules`、`cases`
- `inventory.json`：上次同步时枚举出的 master 用例与提交号，由命令写出
- `enumerate.ts`：枚举 master 与 next 的用例
- `check.ts`：校验对照表（valibot）并比对，纯函数
- `cli.ts`：命令入口
- `root.ts`：包根目录、工作区根目录与 master 检出目录的缺省位置
- `preload/`：枚举 master 时替换 `node:test` 的预加载模块

用例标识是 `<file>::<name>`：`<file>` 是相对 `test/` 的文件，`<name>` 是用例全名。全名是外层 `describe` 与用例名用 ` > ` 连接；同一文件里重名的用例按出现顺序加 ` #2`、` #3`。next 的用例标识形式相同，`<file>` 相对仓库根，`<name>` 是 Vitest 全名。

## 状态

| 状态 | 必填字段 | 含义 |
| --- | --- | --- |
| `covered` | `next`（至少一条） | next 有等价用例 |
| `rewritten` | `next`、`reason` | 按新接口改写，断言有变化 |
| `moved` | `owner` | 归别的包，例如 `alliance/server/content` |
| `not-migrated` | `reason` | 不迁移 |
| `pending` | `step` | 等待计划的某一步 |

`rules` 按 glob 整批标记，只能用 `moved`、`not-migrated`、`pending`，先写的规则优先；`cases` 的逐条条目优先于规则。glob 中 `::` 之前是文件部分，`**` 跨目录，`*` 不跨 `/`；`::` 之后的 `*` 匹配任意字符；没有 `::` 时匹配文件下的全部用例。`caseByCase` 列出的范围（当前是 `sim/**`）必须逐条写在 `cases` 里。

## 枚举

master 的测试文件是 `test/` 下的 `*.test.js`、`*.test.mjs`、`*.test.cjs`，与 `node --test` 实际运行的范围一致，辅助模块与 `e2e` 下的脚本不算。每个文件在单独的子进程里导入：

```sh
node --import preload/register.js preload/run.js <test-file> <result-file>
```

`register.js` 注册模块解析钩子，把 `node:test` 换成替身。替身的 `describe`、`suite` 执行回调以找到嵌套用例；`test`、`it`（含 `.skip`、`.only`、`.todo`）只记下全名，不执行用例体；`before`、`after` 等钩子什么都不做。用例体里的 `t.test` 子用例因此不会出现，按所在用例记录。枚举不依赖 `--test-name-pattern`，对 Node 版本没有额外要求。

导入失败（例如缺少 `public/vendor/*`）或 60 秒内没有导入完的文件记为枚举错误，报告列出文件与原因，命令以非零码退出，不会跳过。

next 的用例在每个有 Vitest 配置的工作区子包里运行 `vitest list --json` 得到，同样不执行用例。

## 运行

在 `alliance/compat/upstream` 内：

```sh
pnpm build && pnpm case-map
```

| 参数 | 含义 |
| --- | --- |
| `--repo <dir>` | master 检出目录，缺省为 `alliance/compat/upstream/repo/` |
| `--commit <sha>` | master 目录不是 git 检出时指定提交号；缺省用 `git rev-parse` 读取 |
| `--write-inventory` | 把这次枚举结果与提交号写入 `inventory.json` |
| `--concurrency <n>` | 同时导入的文件数，缺省为 CPU 数 |

master 检出目录缺省为 `alliance/compat/upstream/repo/`，已列入该包的 `.gitignore`。目录必须已经安装依赖：没有 `node_modules` 时命令报错退出，提示先在该目录运行 `npm ci`，或用 `--repo` 指定别的检出目录。命令不修改 master 目录。`npm ci` 的 postinstall 会生成 `public/vendor/*`，部分测试文件导入时需要它们。

报告给出用例总数、逐条与规则各标记了多少、各状态的数量、每条规则命中的数量，并列出：

- 未对应的用例、`caseByCase` 范围里只靠规则标记的用例、`next` 引用在 next 里找不到的悬空引用。出现任何一项，或有枚举错误、对照表校验失败，命令以非零码退出。
- 相对 `inventory.json` 新增与消失的用例、没有对应 master 用例的条目（多半是改名）、没有命中任何用例的规则。这几项只提示。

master 提交号与 `upstream.commit` 不同时，报告提示先审阅新增用例，再更新 `upstream.commit` 并用 `--write-inventory` 重写清单。
