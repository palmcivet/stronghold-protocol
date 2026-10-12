---
title: 快速开始
description: 装上内置模块，让一名敌人沿路线走向保护目标，跑到分出胜负，读出事件、快照与账本。
---

# 快速开始

## 安装

```sh
npm install arknights-mission-core
```

包只有根导出，没有运行时依赖。

## 一场战斗

下面这场战斗有一行五格：最左边是保护目标，最右边一格放一名干员。敌人第 1 秒从中间刷出，向保护目标走去。

```ts
import {
  type BattleSpec,
  blockModule,
  costModule,
  createBattle,
  deployModule,
  leakModule,
  type MissionModule,
  redeployModule,
  type UnitSpec,
} from "arknights-mission-core"

const tiles: BattleSpec["tiles"] = [0, 1, 2, 3, 4].map((x) => ({
  x,
  y: 0,
  height: 0,
  deployable: x > 0,
  walkableBy: ["ground"],
  objective: x === 0,
}))

const guard: UnitSpec = {
  id: "guard",
  side: "ally",
  owner: "p1",
  x: 1,
  y: 0,
  facing: "RIGHT",
  attributes: { hp: 2000, maxHp: 2000, atk: 400, def: 100, aspd: 100 },
  skills: [],
  attackRange: [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
  ],
  tags: [],
  deployPositions: ["ground"],
}

const slug: UnitSpec = {
  id: "slug",
  side: "enemy",
  x: 3,
  y: 0,
  facing: "LEFT",
  attributes: { hp: 1200, maxHp: 1200, atk: 150, def: 0, moveSpeed: 1 },
  skills: [],
  attackRange: [],
  tags: [],
  deployPositions: [],
  route: { checkpoints: [{ type: "move", x: 0, y: 0 }] },
}

const spec: BattleSpec = {
  seed: 1,
  modules: ["deploy", "cost", "block", "leak", "redeploy", "referee"],
  tiles,
  units: [guard],
  spawns: [{ atTick: 30, unit: slug }],
  deployStrategy: "deploy",
  cost: {
    ally: { initial: 10, regen: 1, cap: 99 },
    enemy: { initial: 0, regen: 0, cap: 0 },
  },
}

// 核心不判胜负，也不替单位开始攻击，这些由模块决定
const referee: MissionModule = {
  id: "referee",
  install(reg) {
    reg.subscribe("deploy", (event, ctx) => {
      ctx.startTimer(event.data.unitId, "attack")
    })
    reg.subscribe("spawn", (event, ctx) => {
      ctx.startTimer(event.data.unitId, "attack")
    })
    reg.subscribe("leak", (_event, ctx) => {
      ctx.finish("enemy")
    })
    reg.subscribe("downed", (event, ctx) => {
      if (ctx.unit(event.data.unitId)?.side === "enemy") {
        ctx.finish("ally")
      }
    })
  },
}

const battle = createBattle(spec, [
  deployModule,
  costModule,
  blockModule,
  leakModule,
  redeployModule,
  referee,
])

while (!battle.result().finished && battle.snapshot().tick < 30 * 60) {
  battle.step()
  for (const event of battle.drainEvents()) {
    if (event.type === "blocked" || event.type === "downed") {
      console.log(event.tick, event.type, event.data)
    }
  }
}

export const result = battle.result() // { finished: true, winner: "ally" }
export const ledger = battle.ledger().owners.p1 // kills: 1
```

- 模块的数组顺序不决定安装顺序，`spec.modules` 必须点到每个传入的模块，见 [战斗](./03-battle.md)
- 用了部署策略 `deploy`，开场部署发生在第一次 `step` 里，所以 `deploy` 事件能被订阅者收到
- 干员的攻击范围按面向 `RIGHT` 填写，`{ x: 0, y: 0 }` 是自己的格子
- 敌人被挡住后停在原地，`blocked` 事件带 `blockerId` 与 `enemyId`

## 读出这一场

- `snapshot()`：按 `id` 排序的单位，给画面使用，见 [快照](./03-battle.md#快照)
- `drainEvents()`：取出并清空事件缓冲，不取就一直留着
- `ledger()`：按 `owner` 分行的击倒、漏出、伤害与治疗
- `export()`：纯数据，传给 `createBattle(spec, modules, archive)` 从这里接着推进

## 下一步

- [规格](./02-spec.md)：单位与技能的全部字段
- [模块](./04-module.md)：登记自己的规则
- [API 参考](./15-api.md)
