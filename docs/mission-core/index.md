---
title: 作战核心
description: arknights-mission-core 用一份规格跑一场战斗，按固定节拍推进，读出快照、事件和胜负。
---

# arknights-mission-core

`arknights-mission-core` 执行一场战斗。调用方准备一份 `BattleSpec` 和零个或多个 `MissionModule`，`createBattle` 返回一场 `Battle`。同一份规格、同一组模块、同一个种子，每次 `step` 的结果相同。

## 边界

- 输入是纯数据的规格与玩家输入，输出是快照、事件、结果与账本
- 随机数只来自这场战斗自己的发生器；不读时钟，不用各引擎结果不同的 `Math` 函数
- 不画画面、不放声音，也不认玩家与房间：单位只带对核心不透明的 `owner`
- 没有运行时依赖，Node.js 20 及以上与浏览器都能运行

## 最小示例

```ts
import {
  type BattleSpec,
  createBattle,
  type MissionModule,
} from "arknights-mission-core"

const spec: BattleSpec = {
  seed: 1,
  modules: ["arm"],
  tiles: [{ x: 0, y: 0, height: 0, deployable: true, walkableBy: ["ground"] }],
  units: [
    {
      id: "guard",
      side: "ally",
      x: 0,
      y: 0,
      facing: "RIGHT",
      attributes: { hp: 1000, maxHp: 1000, atk: 200, def: 0, aspd: 100 },
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

const arm: MissionModule = {
  id: "arm",
  install(reg) {
    reg.subscribe("attack-hit", (event) => {
      console.log(event.tick, event.data.unitId)
    })
    reg.registerSystem({
      id: "arm",
      slot: "schedule",
      priority: 0,
      run(ctx) {
        if (ctx.tick() === 0) {
          ctx.startTimer("guard", "attack")
        }
      },
    })
  },
}

export const battle = createBattle(spec, [arm])
battle.drainEvents() // 开场的 deploy 事件
battle.step()
battle.snapshot().tick // 1
```

一拍是 `TICK`（`1 / 30` 游戏秒）。`snapshot().tick` 在第一次 `step` 之前是 0，每一拍走完阶段槽后加 1。

## 核心概念

- [规格](./02-spec.md)：地块、单位、技能与刷出
- [战斗](./03-battle.md)：推进、输入、快照、事件、结果、账本与导出
- [模块](./04-module.md)：登记规则，发命令，做查询
- [世界、组件、资源与标签](./05-world.md)：按带类型的键存取状态
- [伤害](./06-damage.md)、[技能](./07-skill.md)、[攻击](./08-attack.md)、[计时](./09-timer.md)
- [效果与属性](./10-effect.md)、[选择器](./11-selector.md)、[费用、阻挡与投射物](./12-field.md)
- [黄金回放与源码扫描](./13-testing.md)

## 下一步

- [快速开始](./01-quick-start.md)：装上内置模块，跑完一场有敌人的战斗
- [API 参考](./15-api.md)：公开函数与类型的签名
- [架构设计](./16-architecture.md)：包布局、依赖方向与确定性数学
