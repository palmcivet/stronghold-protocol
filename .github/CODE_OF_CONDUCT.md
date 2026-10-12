# Code of Conduct

- [Code of Conduct](#code-of-conduct)
  - [代码风格](#代码风格)
    - [目录与领域](#目录与领域)
    - [命名](#命名)
    - [注释](#注释)
    - [路径与报错](#路径与报错)
  - [测试](#测试)
  - [文档](#文档)
    - [页面撰写](#页面撰写)
    - [表格](#表格)
    - [篇幅与枚举](#篇幅与枚举)

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

- 对外接口的注释尽量使用英语，中文也可接受
- 报错信息应使用英语，便于日志检索与对外暴露

  ```ts
  // good
  throw new Error(`Unknown effect cue: ${cueId}`)

  // bad
  throw new Error(`未知特效 cue：${cueId}`)
  ```

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
