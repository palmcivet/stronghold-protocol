---
title: 连接 master 后端
description: 客户端连接 master 后端时，如何从它的 assets.json 读出资源，哪些地址能映射，哪些不能。
---

# 连接 master 后端

客户端连接 master 后端时，资源不从基础包与赛季包读取，而是从后端的 `data/assets.json` 生成一份 `upstream` 包清单。`assets-catalog` 仍只看资源键，不认识 master 的地址格式。地址到键的映射由 `app/compat/upstream` 负责。

## 读取的文件

| 地址 | 必需 | 说明 |
| --- | --- | --- |
| `<backend>/data/assets.json` | 是 | master 的资源表：干员、敌人、召唤物、音频、字体等 |
| `<backend>/data/local-assets.json` | 否 | master 本机提取的资源表。不存在时按空处理 |

同一份 `assets.json` 也可以在构建之外用 `buildUpstreamManifest` 生成清单。它返回清单与问题列表，不读取文件系统。

## 图层顺序

客户端在兼容模式下按以下顺序叠加图层，后者替换前者的同名键：

1. 下一版基础包（可选，配置 `nextBase` 时加载）
2. master 后端生成的 upstream 清单
3. 本地覆盖清单（`local` 选项，缺失时为空）

下一版基础包只补 master 缺的键。赛季包不参与兼容模式，因为它的内容可能与 master 后端的赛季不一致。

## 地址映射

每条映射规则写在 `app/compat/upstream/data/asset/rules.ts`。下表是概要：

| master 地址 | 资源键 | 领域引用 |
| --- | --- | --- |
| `chars.<id>.avatar`、`avatarE2` | `image:char/avatar/<文件名>` | `chars.<id>.avatar`、`avatarElite` |
| `chars.<id>.portrait`、`portraitE2` | `image:char/portrait/<文件名>` | `chars.<id>.portrait`、`portraitElite` |
| `chars.<id>.spine.front`、`back` | `spine:char/<id>/front` 或 `back` | `chars.<id>.spine.<姿势>` |
| `enemies.<id>.icon`、`spine` | `image:enemy/icon/<id>`、`spine:enemy/<id>` | `enemies.<id>.icon`、`spine` |
| `tokens.<id>.avatar` | `image:token/icon/<id>` | `tokens.<id>.icon` |
| `tokens.<id>.spine` | `spine:token/<id>/front` | `tokens.<id>.spine` |
| `tokens.<id>.spine`（有 `spineVariant`） | `spine:token/<id>/<变体名>` | `tokens.<id>.spineVariants.<变体名>` |
| `bonds`、`bands` | `image:bond/<名>`、`image:band/<名>` | `bonds.<名>`、`bands.<名>` |
| `items.<id>` | `image:season/act2autochess/trap/<id>` | `items.<id>` |
| `modules.<名>` | `image:module/<小写文件名>` | 无 |
| `skills.<id>`、`skillsById.<id>` | `image:skill/<文件名>` | `skills.<id>` |
| `prof.icon`、`large`、`battlecard`、`sub` | `image:prof/...`、`image:prof/large/...`、`image:prof/card/...`、`image:prof/sub/...` | `prof.icon.<职业>` 等 |
| `ui.<路径>` | `image:ui/<路径>` | 无 |
| `audio.bgm`、`audio.bossBgm`（含 `combatAlts`） | `audio:bgm/<文件名>` | `bgm.<文件名>` |
| `audio.voice.<角色>.<槽位>` | `audio:voice/cn/<角色>/<文件名>` | `voice.<角色>.<槽位>`（列表槽位为键的数组） |
| `audio.sfx.ui.<名>`（`general/g_ui/`） | `audio:sfx/ui/<文件名>` | `sfx.ui.<文件名>` |
| `audio.sfx.battle.<名>`（`battle/<目录>/`） | `audio:sfx/battle/<文件名>` | `sfx.battle.<文件名>` |
| `audio.sfx.units.<单位>.<槽位>`（`player`、`enemy`、`battle` 目录） | `audio:sfx/battle/<文件名>` | 无 |
| `fonts.faces.<id>.woff2` | `font:<字体族>/<字重>` | `fonts.<字体族>.<字重>` |

文件路径规则：

- 图片、Spine、字体的文件地址是后端的 `/assets/...` 与 `/fonts/...`。
- 音频走后端的 `/media/...` 路由，去掉目录前缀 `/assets/audio/` 和扩展名。
- 清单的文件没有字节数与哈希，`hash` 为空串，客户端不校验。

## 不映射的地址

映射失败的地址不猜测，记入问题列表（`store.compatIssues`），并且不生成键。以下情况会进入问题列表：

- `enemies.<id>.spineLocal`、`tokens.<id>.spineLocal`：本机客户端提取的 Spine，只能由 `local-assets.json` 提供，当前未读取。
- 音效不在映射目录下：`audio.sfx.ui` 中不在 `general/g_ui/` 的地址（如 `customse/`、`battle/`）、`audio.sfx.battle` 中的 `player/`、`enemy/` 目录、`audio.sfx.units` 中的 `ambience/` 目录。
- 键不合法的地址，例如 `ui` 路径中含 `.` 或空格。
- 同一键来自两个不同地址时，保留先出现的一个，后者记入问题。

不作为资源读取的字段：`fonts.css`、字体的 `original` 原始文件、`enemies.<id>.spineAliasOf`、`tokens.<id>.owner`、`audio.sfx.units.<单位>.mix`（音量与音调数值），以及 `version`、`hash`、`generator`、`stats`。


## 用例对照表

`app/compat/upstream/case-map/` 记录 master 的每条测试用例在 next 里的去向，并检查对照表与两边的用例清单一致。

### 文件

| 文件 | 内容 |
| --- | --- |
| `mapping.json` | 人工维护的对照：`upstream`（仓库与提交号）、`caseByCase`、`rules`、`cases` |
| `inventory.json` | 上次同步时枚举出的 master 用例与提交号，由命令写出 |
| `enumerate.ts` | 枚举 master 与 next 的用例 |
| `check.ts` | 校验对照表（valibot）并比对，纯函数 |
| `cli.ts` | 命令入口 |
| `root.ts` | 包根目录、工作区根目录与 master 检出目录的缺省位置 |
| `preload/` | 枚举 master 时替换 `node:test` 的预加载模块 |

用例标识是 `<相对 test/ 的文件>::<用例全名>`。全名是外层 `describe` 与用例名用 ` > ` 连接；同一文件里重名的用例按出现顺序加 ` #2`、` #3`。next 的用例标识是 `<相对仓库根的文件>::<Vitest 全名>`。

### 状态

| 状态 | 必填字段 | 含义 |
| --- | --- | --- |
| `covered` | `next`（至少一条） | next 有等价用例 |
| `rewritten` | `next`、`reason` | 按新接口改写，断言有变化 |
| `moved` | `owner` | 归别的包，例如 `app/server/content` |
| `not-migrated` | `reason` | 不迁移 |
| `pending` | `step` | 等待计划的某一步 |

`rules` 按 glob 整批标记，只能用 `moved`、`not-migrated`、`pending`，先写的规则优先；`cases` 的逐条条目优先于规则。glob 中 `::` 之前是文件部分，`**` 跨目录，`*` 不跨 `/`；`::` 之后的 `*` 匹配任意字符；没有 `::` 时匹配文件下的全部用例。`caseByCase` 列出的范围（当前是 `sim/**`）必须逐条写在 `cases` 里。

### 枚举

master 的测试文件是 `test/` 下的 `*.test.js`、`*.test.mjs`、`*.test.cjs`，与 `node --test` 实际运行的范围一致，辅助模块与 `e2e` 下的脚本不算。每个文件在单独的子进程里导入：

```sh
node --import preload/register.js preload/run.js <测试文件> <结果文件>
```

`register.js` 注册模块解析钩子，把 `node:test` 换成替身。替身的 `describe`、`suite` 执行回调以找到嵌套用例；`test`、`it`（含 `.skip`、`.only`、`.todo`）只记下全名，不执行用例体；`before`、`after` 等钩子什么都不做。用例体里的 `t.test` 子用例因此不会出现，按所在用例记录。枚举不依赖 `--test-name-pattern`，对 Node 版本没有额外要求。

导入失败（例如缺少 `public/vendor/*`）或 60 秒内没有导入完的文件记为枚举错误，报告列出文件与原因，命令以非零码退出，不会跳过。

next 的用例在每个有 Vitest 配置的工作区子包里运行 `vitest list --json` 得到，同样不执行用例。

### 运行

在 `app/compat/upstream` 内：

```sh
pnpm build && pnpm case-map
```

| 参数 | 含义 |
| --- | --- |
| `--repo <目录>` | master 检出目录，缺省为 `app/compat/upstream/repo/` |
| `--commit <提交号>` | master 目录不是 git 检出时指定提交号；缺省用 `git rev-parse` 读取 |
| `--write-inventory` | 把这次枚举结果与提交号写入 `inventory.json` |
| `--concurrency <n>` | 同时导入的文件数，缺省为 CPU 数 |

master 检出目录缺省为 `app/compat/upstream/repo/`，已列入该包的 `.gitignore`。目录必须已经安装依赖：没有 `node_modules` 时命令报错退出，提示先在该目录运行 `npm ci`，或用 `--repo` 指定别的检出目录。命令不修改 master 目录。`npm ci` 的 postinstall 会生成 `public/vendor/*`，部分测试文件导入时需要它们。

报告给出用例总数、逐条与规则各标记了多少、各状态的数量、每条规则命中的数量，并列出：

- 未对应的用例、`caseByCase` 范围里只靠规则标记的用例、`next` 引用在 next 里找不到的悬空引用。出现任何一项，或有枚举错误、对照表校验失败，命令以非零码退出。
- 相对 `inventory.json` 新增与消失的用例、没有对应 master 用例的条目（多半是改名）、没有命中任何用例的规则。这几项只提示。

master 提交号与 `upstream.commit` 不同时，报告提示先审阅新增用例，再更新 `upstream.commit` 并用 `--write-inventory` 重写清单。
