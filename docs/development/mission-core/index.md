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
      tags: ["canHitFly"],
      deployPositions: ["ground"],
    },
  ],
  spawns: [],
  deployStrategy: null,
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

## 文档

| 页 | 内容 |
| --- | --- |
| [规格](./spec.md) | `BattleSpec`、单位、地块、技能、刷出 |
| [战斗](./battle.md) | `createBattle`、`step`、阶段槽、快照、事件、结果 |
| [模块](./module.md) | `MissionModule`、八类注册、`ContentContext` |
| [伤害](./damage.md) | 伤害步骤、治疗、流失、元素槽 |
| [技能](./skill.md) | 技力、充能、触发、技能体 |
| [攻击](./attack.md) | 攻击计时、片段、出手 |
| [状态](./status.md) | 施加、叠层、内置状态 |
| [选择器](./selector.md) | 筛选、排序、范围 |
