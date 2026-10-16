# Code of Conduct

- [Code of Conduct](#code-of-conduct)
  - [代码风格](#代码风格)
    - [目录与领域](#目录与领域)
    - [命名](#命名)
    - [注释](#注释)
    - [路径与报错](#路径与报错)
  - [类型](#类型)
  - [测试](#测试)
  - [文档](#文档)
    - [页面撰写](#页面撰写)
    - [表格](#表格)
    - [篇幅与枚举](#篇幅与枚举)
  - [alliance 开发](#alliance-开发)
    - [设置](#设置)
    - [平台](#平台)
    - [界面](#界面)

## 代码风格

### 目录与领域

- 按领域划分目录，同一层的领域互为同级；同一目录里的文件或文件夹应对等，不要把「子实现」和「兄弟领域」混在同一层
- 代码应具有自解释性，优先靠命名与结构表达意图，而不是靠注释补救含糊命名

```text
# good — 同级都是领域
mission-core/
  combat/
  ability/
  field/

# bad — 实现细节冒充同级领域
mission-core/
  combat/
  helpers/          # 横切工具，不是领域
  combat-utils.ts   # 与 combat/ 不对等
```

```text
# good — 领域下再拆子领域
combat/
  attack/
  damage/
  target/

# bad — 把调用方关心的层次压扁
combat/
  attack-damage-target.ts
```

### 命名

- 文件和目录命名尽量使用名词；若必须用其他词性，同一领域内保持统一。风格采用 kebab-case

  ```text
  # good
  kernel/random/index.ts
  combat/attack/timing.ts
  actor/hud/readout.ts

  # bad
  kernel/random/random.ts      # 目录名重复
  combat/attack/AttackTiming.ts
  actor/hud/readOut.ts
  ```

- 一个领域只有一个实现文件时，入口用 `index.ts`，不要把目录名再写一遍
- 统一领域的命名风格应保持一致，尤其是对外导出的标识符
- 避免非通用的缩写；通用缩写（如 `hp`、`id`、`url`）可以保留

  ```ts
  // good
  function simulateDamage(...) { ... }
  const remainingMs = ...

  // bad — 非通用缩写
  function simDmg(...) { ... }
  const remMs = ...
  ```

- 对外接口上的常量标识符用 `UPPER_CASE`

  ```ts
  // good — 对外常量
  export const MAX_BOARD_COLUMNS = 11

  // bad
  export const maxBoardColumns = 11
  export const max_board_cols = 11
  ```

- 事件名使用 kebab-case 或 `UPPER_CASE` 二选一，同一领域内必须统一，不要混用

  ```ts
  // good — 同一领域事件风格统一
  bus.emit('attack-hit', payload)
  bus.emit('element-burst', payload)

  // bad — 同一领域混用
  bus.emit('attack-hit', payload)
  bus.emit('elementHit', payload)
  bus.emit('ELEMENT_BURST', payload)
  ```

### 注释

- 禁止装饰性分隔注释（如 `-----`、`//////`、`// -----`）。代码区块划分使用 `// MARK: block`，可被 VS Code 识别并出现在大纲里
- 注释解释「这段代码在做什么 / 为什么这样写」，不要写和当前实现无关的协作说明（下游怎么用、后端怎么调、该进哪个目录、用哪条命令跑）
- 只写当前代码的职责。不要写「某某不在这里实现」「这里不负责某某」——缺席信息应靠目录边界和命名表达，或写在 `plans/` / `docs/`

```ts
// good
// MARK: charge
function advanceCharge(clock: AttackClock, dt: number): void {
  // Wind-up shares the same clock as ammo so pause/resume stay aligned.
  ...
}

// bad — 装饰线 + 协作说明书 + 缺席声明
// ========== charge ==========
// Used by the renderer after feed flush; run via `pnpm test`.
// Damage application is not handled here.
function advanceCharge(...) { ... }
```

```ts
// good — 注释服务当前逻辑
// Clamp before scaling so zero-duration profiles do not divide by zero.
const t = duration <= 0 ? 1 : elapsed / duration

// bad — 注释在讲别的系统
// The client will read this through the snapshot port under mission-renderer/runtime.
```

### 路径与报错

- 使用包/路径别名引用模块，避免 `../`、`../../` 等路径穿透

  ```ts
  // good
  import { createBattle } from 'mission-core/battle/create'
  import type { AttackProfile } from 'mission-core/combat/attack/profile'

  // bad
  import { createBattle } from '../../../battle/create'
  import type { AttackProfile } from '../../attack/profile'
  ```

- 库模块对外接口的注释尽量使用英语，中文也可接受
- 报错信息应使用英语，便于日志检索与对外暴露

  ```ts
  // good
  throw new Error(`Unknown effect cue: ${cueId}`)

  // bad
  throw new Error(`未知特效 cue：${cueId}`)
  ```

## 类型

- 避免轻易引入 `any`
- 使用类型时，需要思考相关类型是否已存在
- 类型设计属于架构设计的一部分，需要考虑哪些是内部类型，哪些需要公开

## 测试

- 只覆盖单个源文件的单元测试：放在源文件边上，后缀 `.test.ts`
- 需要两个及以上源文件协作才能成立的测试：放到 `<module>/test/`，后缀 `.spec.ts`，目录可按领域再聚合
- 端到端测试：后缀 `.e2e.ts`

```text
# good — 单文件单元测试跟源码
mission-renderer/audio/index.ts
mission-renderer/audio/index.test.ts
mission-core/kernel/random/index.ts
mission-core/kernel/random/index.test.ts

# good — 跨文件行为进 module/test
mission-core/test/combat/attack/chain.spec.ts
mission-renderer/test/effect/lifecycle.spec.ts
```

## 文档

- `docs/` 为面向使用者的文档目录，站在库用户角度编写，参考 Vue、Zod 等流行开源库的写法；内容会直接发布
- 修改代码后同步更新文档，文档与公开行为保持一致
- 文档按模块划分；库文档应客观独立，不绑定某一款游戏的业务叙事
- 设计原理与实现机制（架构、机制、为什么这样设计）写进 `docs/`
- 文档说明见 [docs/README.md](docs/README.md)

### 页面撰写

- 一页回答一个主问题，标题必须覆盖正文；跨模块细节用链接，不在本页复述
- 页内按「概念 → 最小示例 → 规则 → 清单」排列
- 一句一事；多条件分支拆成列表；单段不超过约 5 行
- 一个词只指一个概念，模块内术语首次出现时说明
- 示例可运行，不应调用未定义的占位函数；`ts` 代码块在 `vitepress build` 时做类型检查
- 代码与测试不得反向依赖文档
- 库文档只写导出的接口，不写应用的目录、部署与版本；应用细节写在应用文档，再链接到库
- 每页有 `title` 与 `description` frontmatter

### 表格

- 减少表格；简单、稳定、列少的对照可以用表格
- 复杂、易变或列很多的数据不要用表格硬塞，改用列表或子章节

```markdown
<!-- good — 小而稳定 -->
| 字段 | 类型 |
| --- | --- |
| `id` | `string` |
| `hp` | `number` |

<!-- bad — 大表承载易变枚举 -->
| cue | layer | audio | impostor | notes | ... |
| --- | --- | --- | --- | --- | --- |
| ...整页特效对照... |
```

### 篇幅与枚举

- 减少大段散文。语义对等的条目用列表；对等块较大时拆成子章节
- 简介不要为了「完整」而全量枚举实现细节；简介只点到职责与边界，清单放到专门章节，避免每次增删资源都被迫改导读句

```markdown
<!-- bad — 简介里全量罗列，后续每次改包都要同步这句话 -->
赛季包只含 bgm、sfx、bands、bonds、items、animRoles、board。

<!-- good — 简介说职责，清单归子章节 -->
赛季包描述一季可用的媒体与内容清单。

## 内容条目

- `bgm` / `sfx` — 音频
- `bands` / `bonds` — ...
```

```markdown
<!-- good — 对等语义用列表 -->
攻击时钟负责：

- 充能
- 弹药间隔
- 回旋体进度

<!-- bad — 揉进一段话里 -->
攻击时钟负责充能，并且也会推进弹药间隔，此外回旋体进度也由它更新，暂停时三者一起停。
```

## alliance 开发
### 设置

- 按段注册：`defineSettingSection`
- 领域读写：`getSetting` / `setSetting` / `useSetting`；预读与注册之后 `startSettings`
- 启动 / 集成：`migrateSettingsSections`、`registerOfficialSettings`、`setChannel`、`onGroundQuality`
- 不与 welcome 的后端 `Capabilities` 合并；模组经自有段 id 贡献设置，不塞进官方四段
- 持久化走存储命名空间（每段一项 `settings.*`），见本地存储文档

### 平台

- 只用 `configurePlatform` / `probe` / `getPlatform`；`Platform` 为布尔能力字段快照
- 与 `infra/connection` 的后端 `Capabilities` 分开，不要混用或合并
- 业务代码禁止临时 `typeof` / UA 嗅探判能力；宿主（Tauri / Capacitor 等）用 `configurePlatform` 覆盖
- `resetPlatform` / `resetSettingSections` 仅测试，产品代码不得调用

### 界面

尺寸与单位：

- 所有盒子尺寸以设计像素（dp，1920×1080 画布上的 1 像素）书写：模块 CSS 用令牌，没有对应令牌时写 `calc(var(--wsde-dp) * N)`；字号用字号令牌或 `calc(var(--wsde-text-dp) * N)`
- 允许的单位：`%`、`fr`、`em`、时间与角度；线宽保留真实像素 `1px` / `2px`
- 禁止 `rem`、其他 `px` 与视口单位（`vw`、`vh`、`dvh` 等）；CSS 由 stylelint 检查，TSX 与 TS 里拼出的长度由 `test/infra/units.test.ts` 检查
- 内联样式里的长度也写成 dp；组件的尺寸参数用 dp 数值，不带单位

```tsx
// good
<Grid min={192}>...</Grid>
style={{ '--min': `calc(var(--wsde-dp) * ${min})` }}

// bad
<Grid min={12}>...</Grid>          // 12 指 rem
style={{ '--min': `${min}rem` }}
```

令牌与色调：

- 组件只读语义令牌（`color`、`tone`、`font`、`size` 等），不读 `palette`；页面样式同理
- `data-tone` 只取色调名：`accent`、`gold`、`amber`、`orange`、`danger`、`ice`、`neutral`
- 状态词与类别不占用 `data-tone`：富文本的类别用 `data-kind`，阶段用 `data-phase`；状态词在组件内部映射成色调名
- 读 `--wsde-tone-*` 的组件在自己的根节点上写 `data-tone`，不依赖祖先
- 色调要么由 `tone` 属性给出，要么由 `variant` 或状态派生；两者不并存
- `size` 属性取 `ControlSize`（`sm`、`md`、`lg`、`xl`），不另造档位

```tsx
// good — 状态词映射成色调名，类别用 data-kind
<Badge tone="amber">Auto</Badge>
<span data-kind="positive">+10%</span>

// bad — 状态词和类别混进 data-tone
<Badge tone="warn">Auto</Badge>
<span data-tone="positive">+10%</span>
```

`ui/` 组件：

- 按领域分同级文件夹（`action/`、`form/`、`surface/`、`status/` 等）；不要把不同领域的文件平铺在 `ui/` 下
- 只有一个实现文件的领域用 `index.tsx` 与 `index.module.css`；多文件的领域，样式与组件同名
- 组件是纯 props，不读状态仓库、不发意图；音效经 `useFeedback`
- `ui/` 内跨文件夹用 `#ui/<文件夹>/…`，同文件夹内用相对路径；`ui/` 之外只从 `#ui/index.js` 导入
- 新组件的用例按语义查询，放在 `test/ui/`；规格写进 `docs/alliance/maintain/client/19-component.md`
