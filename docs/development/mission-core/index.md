---
title: 作战核心
description: arknights-mission-core 用一份规格跑一场战斗，按固定节拍推进，读出快照、事件和胜负。
---

# 作战核心

`arknights-mission-core` 执行一场战斗。调用方准备一份 `BattleSpec` 和零个或多个 `MissionModule`，`createBattle` 返回一场 `Battle`。同一份规格、同一组模块、同一个种子，每次 `step` 的结果相同。随机数只来自这场战斗自己的发生器。

语言是 TypeScript。运行时是 Node.js 20，同一套模块也可以放进浏览器。

```ts
import { createBattle, TICK, type BattleSpec, type MissionModule } from "arknights-mission-core"

const spec: BattleSpec = {
  seed: 1,
  modules: ["trace"],
  tiles: [{ x: 0, y: 0, height: 0, deployable: true, walkableBy: ["ground"] }],
  units: [
    {
      id: "guard",
      side: "ally",
      x: 0,
      y: 0,
      facing: "RIGHT",
      attributes: { hp: 1000, maxHp: 1000, atk: 200, def: 0, aspd: 100, bat: 1 },
      skills: [],
      attackRange: [{ x: 1, y: 0 }],
      tags: ["can-hit-fly"],
      deployPositions: ["ground"],
    },
  ],
  spawns: [],
  deployStrategy: null,
  cost: {
    ally: { initial: 10, regen: 1, cap: 99 },
    enemy: { initial: 0, regen: 0, cap: 0 },
  },
}

const trace: MissionModule = {
  id: "trace",
  install(reg) {
    reg.subscribe("attack-hit", (event) => {
      console.log(event.tick, event.type)
    })
    reg.registerSystem({
      id: "arm",
      slot: "schedule",
      priority: 0,
      run(ctx) {
        if (ctx.tick() === 0) ctx.startTimer("guard", "attack")
      },
    })
  },
}

const battle = createBattle(spec, [trace])
battle.step()
const snap = battle.snapshot()
const events = battle.drainEvents()
const result = battle.result()
```

`TICK` 是 `1 / 30`，一拍的游戏秒数。`snapshot().tick` 在第一次 `step` 之前是 0。每一拍先走完阶段槽，再把拍数加 1。

## 目录

顶层目录分三类：边界、运行时、领域组。每个顶层目录有一个路径别名，包内用别名引用，不写相对路径。

| 目录 | 别名 | 内容 |
| --- | --- | --- |
| `contract/` | `#contract/*.js` | 对外的纯数据：规格、事件、快照、结果、阶段槽 |
| `port/` | `#port/*.js` | 内容端口：`module.ts`（`MissionModule`、`Registration`）、`definition.ts`（各类定义与 `BattleRegistry`）、`context.ts`（`ContentContext`）、`tag.ts`（核心标签），练度与装备的数值合成 |
| `test/` | `#test/*.js` | 黄金回放、源码扫描、测试夹具，与按组分目录的用例 `test/<组>/<领域>/` |
| `kernel/` | `#kernel/*.js` | 运行时内核，只引用 `contract/`：`math/`、`tick/`、`random/`、`timer/`（通用计时）、`registry/`（通用注册表）、`schedule/`（阶段槽排序）、`event/`、`world/`（世界、组件、资源、标签、导出与导入） |
| `battle/` | `#battle/*.js` | 组装与推进：建战斗、组装 `BattleRegistry`、每拍的系统、上下文、快照、帧时钟、无头推进 |
| `unit/` | `#unit/*.js` | 单位与生命周期：`record/`、`deploy/`、`block/`、`leak/` |
| `combat/` | `#combat/*.js` | 战斗：`attack/`、`target/`、`damage/`、`projectile/`、`element/` |
| `ability/` | `#ability/*.js` | 技能与状态：`skill/`、`effect/` |
| `field/` | `#field/*.js` | 场地与移动：`direction/`、`grid/`、`body/`、`motion/` |
| `economy/` | `#economy/*.js` | 费用 |
| `ledger/` | `#ledger/*.js` | 按单位 `owner` 记的账本 |

例如 `#kernel/tick/index.js`、`#combat/damage/formula.js`。包只有根导出 `arknights-mission-core`。

## 文档

| 页 | 内容 |
| --- | --- |
| [规格](./spec.md) | `BattleSpec`、单位、地块、技能、刷出 |
| [战斗](./battle.md) | `createBattle`、`step`、阶段槽与系统顺序、快照、事件、结果、账本、导出与导入 |
| [模块](./module.md) | `MissionModule`、各类注册、部署策略、`ContentContext` |
| [世界、组件、资源与标签](./world.md) | `World`、`defineComponent`、`defineResource`、`defineTag`、核心标签 |
| [伤害](./damage.md) | 伤害步骤、治疗、流失、元素槽 |
| [技能](./skill.md) | 技力、充能、触发、技能体 |
| [攻击](./attack.md) | 攻击计时、片段、出手 |
| [计时](./timer.md) | 充能、弹药、回旋持有、速度 |
| [状态](./status.md) | 施加、叠层、内置状态 |
| [选择器](./selector.md) | 筛选、排序、范围 |
| [费用、阻挡与投射物](./field.md) | 费用池、再部署、阻挡、泄漏、投射物飞行 |
| [确定性数学与整帧对齐](./kernel.md) | `kernel/math`、`kernel/tick` |
| [黄金回放与源码扫描](./testing.md) | 回放摘要、确定性扫描、追溯扫描 |
