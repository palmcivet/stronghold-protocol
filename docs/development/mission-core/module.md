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
| `registerShift` | `shift` |
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

计时器登记后，要用 `startTimer(unitId, timerId)` 才开始推进。规格 `timers` 里列出的 id，引擎自己启动。定义上的 `sides` 不包含这个单位的阵营时，`startTimer` 不启动，视图保持未开始。`advanceTimer` 推进一份，还没开始会失败。`timerView` 没开始时是 `{ started: false }`。攻击视图有 `phase`、`elapsed`。技力视图有 `phase`、`elapsed`、`sp`、`charges`、`active`、`activations`。`charge` 有 `stored`、`elapsed`。`ammo` 有 `ammo`、`elapsed`。`boomerang` 有 `out`、`elapsed`。出手要读的 `readAttackTiming` 见 [计时](./timer.md)。

部署策略：

```ts
interface DeployStrategyDefinition {
  id: string
  opening(ctx: ContentContext): readonly string[]
  downedTile(unitId: string, ctx: ContentContext): TileCoord
  canStand(unitId: string, tile: TileCoord, ctx: ContentContext): boolean
}
```

`opening` 返回开场要上场的单位 id。倒地时 `downedTile` 给出落点，引擎把坐标写成这个格子，再用 `canStand` 问这一格现在能不能站。结果放进 `downed` 事件。`canStand` 为假时落点不变。

内置模块 `deploy`（`deployModule`）登记同名策略。规格同时写 `modules: ["deploy"]` 和 `deployStrategy: "deploy"`。常量 `DEPLOY_STRATEGY`、`TOKEN_TAG`、`DEFER_DEPLOY_TAG` 从包根导出。

`token` 是召唤物。`deferDeploy` 是开战不上场的友方，它的初始格子留着。初始格子是放入时的坐标，之后 `displace` 可以离开，初始格子不变。

`opening` 先按放入顺序列出敌人，再列干员，再列召唤物。干员和召唤物按初始格子排：列号小的在前，同一列行号大的在前，再比 id。带 `deferDeploy` 的友方不在这份名单里。

干员的倒地落点是当前坐标四舍五入后的格子。这个格子是另一名友方的初始格子，并且自己的初始格子 `canStand` 为真时，落点改回初始格子。召唤物和敌人留在倒下的格子。这条策略不读取推、拉或恐惧的落点。

`canStand` 看三件事：地块存在且 `deployable` 为真；没有另一名在场单位站在这里；没有另一名倒地干员的当前格子，或一名还没上场的友方的初始格子，落在这里。正在问的这名单位自己不算。召唤物倒地之后不占格。地块高度和 `deployPositions` 留给内容自己的策略，用来判断高台、近战位和远程位。

再部署用倒地之后已经写下的坐标，不调用 `opening` 和 `downedTile`。有部署策略时，回来之前用 `canStand` 看当前这一格；站不住就继续等。

`spawnUnit` 和 `displace` 在规格写了部署策略时先问 `canStand`。站不住就不放入、不改坐标。没有策略时这两条命令不看格子。

## 命令和查询

`dealDamage`、`previewDamage`、`loseHp`、`heal`、`addElement` 见 [伤害](./damage.md)。`applyStatus` 见 [状态](./status.md)。`unitsInRange`、`select`、`hitRect` 见 [选择器](./selector.md)。`shouldCast`、`castSkill`、`gainSp` 见 [技能](./skill.md)。

`spawnUnit(spec)` 放入单位并标成在场，送出 `spawn`。它不装技能计时。规格写了部署策略时，`canStand` 为假就不放入。`displace(unitId, x, y)` 改坐标，清掉这条路线已经算好的路径，送出 `displace`。同样，有部署策略且 `canStand` 为假时坐标不动。`shift` 见 [费用、阻挡与投射物](./field.md)。`setObstacle(x, y, on, kind?)` 在格子上摆障碍，`kind` 缺省 `block`，也可以是 `crate`。

`launchProjectile` 从来源单位的坐标发出一发，送出 `projectile`。可选 `speed` 是格/秒，缺省 `PROJECTILE_SPEED`（12）。`projectiles()` 读出仍在飞的那些，带当前 `x`、`y`。投射物槽里朝目标飞；目标已离场则消掉，不结算。`retain` 为真时落到最后坐标再结算。没有 `attack` 时到达后按 `amount` 造成 `physical` 伤害。超过 `PROJECTILE_MAX_AGE`（10 秒）仍未飞到，就落在目标当前位置并结算。普攻只在 `attackShape.projectile` 上写了种类时改走投射物。

`spendCost(side, amount)` 从该阵营的池里扣。不够、或数额不是有限非负数时返回 false，池子不动。0 视为已经付过，返回 true。`addCost(side, amount)` 加上去，结果不超过规格里的上限。`costOf(side)` 读当前数量。见 [费用、阻挡与投射物](./field.md)。

`schedule(tick, run)` 把回调交给 `schedule` 槽。`finish(winner)` 写下胜负。`tick()` 读当前拍数。`tile(x, y)` 读地块，没有则是 `null`。`moduleData(moduleId, unitId)` 返回这个模块在这个单位上的一份可变记录，没有就新建。`random` 是这场战斗的发生器。

## 随机数

`random` 实现 `Random`。直接调用返回 `[0, 1)`。`int(n)` 返回 `[0, n)` 的整数。`range(a, b)` 返回 `[a, b)`。`chance(p)` 在下一次取样小于 `p` 时为真。`pick` 在空数组上返回 `undefined`。`shuffle` 就地打乱。`weighted` 用非负权重；总权重不大于 0 时返回 `undefined`。`state()` 读内部状态。

`createRandom(seed)` 和 `deriveSeed(seed, salt)` 也从包根导出。战斗本身用规格里的 `seed`，内容用上下文上的 `random`。
