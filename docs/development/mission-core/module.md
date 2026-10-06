---
title: 模块
description: MissionModule 在 install 里登记规则。战斗跑起来之后，同一份 ContentContext 上发命令和做查询。
---

# 模块

```ts
interface MissionModule {
  id: string
  dependsOn?: readonly string[]
  install(ctx: Registration): void
}
```

`install` 只能登记和订阅。命令和查询在 `step` 期间的 `ContentContext` 上，`ContentContext` 继承 `Registration`。

```ts
const module: MissionModule = {
  id: "opening-buff",
  install(reg) {
    reg.registerSystem({
      id: "grant",
      slot: "schedule",
      priority: 0,
      run(ctx) {
        if (ctx.tick() !== 0) return
        ctx.applyStatus("guard", "fragile", { duration: 10, value: 0.2 })
      },
    })
  },
}
```

`spec.modules` 点名要装哪些。`dependsOn` 里的模块先安装，而且必须也出现在这份名单里。

## 注册

未知标识抛出 `UnknownRegistrationError`。`registry` 是被拒绝的那一类，`id` 是那个标识。

| 方法 | `registry` |
| --- | --- |
| `registerStatus` | `status` |
| `registerDamageStep` | 伤害步骤按 `priority` 插入，查找失败不走这一类 |
| `registerElement` | `element` |
| `registerSelector` | `selector` |
| `registerSkillTrigger` | `skill-trigger` |
| `registerSkillBody` | `skill-body` |
| `registerTimer` | `timer` |
| `registerDeployStrategy` | `deploy` |
| `registerSystem` | 槽名不在 `phaseSlots` 里时是 `phase` |

规格点了没有传入的模块，或依赖不在规格名单里，`registry` 是 `module`。

`subscribe(type, handler)` 返回取消订阅的函数。处理函数在事件送出时立刻调用，缓冲里仍保留这条事件，直到 `drainEvents`。

`registerDamageStep` 的 `priority` 小的先执行。换掉同名步骤后按新的优先级重排。内置步骤见 [伤害](./damage.md)。

```ts
interface PhaseSystem {
  id: string
  slot: PhaseSlot
  priority: number
  run(ctx: ContentContext): void
}
```

计时器登记后，要用 `startTimer(unitId, timerId)` 才开始推进。`advanceTimer` 推进一份，还没开始会失败。`timerView` 没开始时是 `{ started: false }`。攻击视图有 `phase`、`elapsed`。技力视图有 `phase`、`elapsed`、`sp`、`charges`、`active`、`activations`。

部署策略：

```ts
interface DeployStrategyDefinition {
  id: string
  opening(ctx: ContentContext): readonly string[]
  downedTile(unitId: string, ctx: ContentContext): TileCoord
  canStand(unitId: string, tile: TileCoord, ctx: ContentContext): boolean
}
```

`opening` 返回开场要上场的单位 id。倒地时用另外两个方法决定落点，以及这个格子现在能不能站。

## 命令和查询

`dealDamage`、`previewDamage`、`loseHp`、`heal`、`addElement` 见 [伤害](./damage.md)。`applyStatus` 见 [状态](./status.md)。`unitsInRange`、`select`、`hitRect` 见 [选择器](./selector.md)。`shouldCast`、`castSkill`、`gainSp` 见 [技能](./skill.md)。

`spawnUnit(spec)` 放入单位并标成在场，送出 `spawn`。它不装技能计时。`displace(unitId, x, y)` 改坐标，清掉这条路线已经算好的路径，送出 `displace`。

`launchProjectile` 记下 `{ id, sourceId, targetId, amount }`，送出 `projectile`。`projectiles()` 读出这些记录。

`schedule(tick, run)` 把回调交给 `schedule` 槽。`finish(winner)` 写下胜负。`tick()` 读当前拍数。`tile(x, y)` 读地块，没有则是 `null`。`moduleData(moduleId, unitId)` 返回这个模块在这个单位上的一份可变记录，没有就新建。`random` 是这场战斗的发生器。

## 随机数

`random` 实现 `Random`。直接调用返回 `[0, 1)`。`int(n)` 返回 `[0, n)` 的整数。`range(a, b)` 返回 `[a, b)`。`chance(p)` 在下一次取样小于 `p` 时为真。`pick` 在空数组上返回 `undefined`。`shuffle` 就地打乱。`weighted` 用非负权重；总权重不大于 0 时返回 `undefined`。`state()` 读内部状态。

`createRandom(seed)` 和 `deriveSeed(seed, salt)` 也从包根导出。战斗本身用规格里的 `seed`，内容用上下文上的 `random`。
