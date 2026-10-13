---
title: 模块
description: MissionModule 在 install 里登记规则。战斗跑起来之后，同一份 ContentContext 上发命令和做查询。
---

# 模块

**模块**是一组规则：它在 `install` 里登记系统、事件订阅、注册项与标签。战斗跑起来之后，模块经同一份 `ContentContext` 发命令、做查询。

下例在第 0 拍给 `guard` 施加 `fragile`：

```ts
import type { MissionModule } from "arknights-mission-core"

export const openingBuff: MissionModule = {
  id: "opening-buff",
  version: "1",
  install(reg) {
    reg.registerSystem({
      id: "grant",
      slot: "schedule",
      priority: 0,
      run(ctx) {
        if (ctx.tick() !== 0) {
          return
        }
        ctx.applyEffect("guard", "fragile", { duration: 10, value: 0.2 })
      },
    })
  },
}
```

`MissionModule` 有 `id`、可选的 `version`（字符串，计入 `contentHash`）、可选的 `dependsOn` 与 `install`。签名见 [API 参考](./15-api.md#模块)。

`install` 只能登记和订阅。命令和查询在 `step` 期间的 `ContentContext` 上，`ContentContext` 继承 `Registration`。

`spec.modules` 点名要装哪些。`dependsOn` 里的模块先安装，而且必须也出现在这份名单里。

## 注册

未知标识抛出 `UnknownRegistrationError`。`registry` 是被拒绝的那一类，`id` 是那个标识。同一类里同一个 id 再登记抛出 `RegistrationConflictError`。

| 方法 | `registry` |
| --- | --- |
| `registerAttribute` | `attribute` |
| `registerEffect` | `effect` |
| `registerStacking` | `stacking` |
| `registerCondition` | `condition` |
| `registerSkillHook` | `skill-hook` |
| `registerDamageModifier` | 按阶段与 `priority` 插入 |
| `registerDamageStep` | 伤害步骤按 `priority` 插入，查找失败不走这一类 |
| `registerElement` | `element` |
| `registerSelector` | `selector` |
| `registerSkillTrigger` | `skill-trigger` |
| `registerSkillBody` | `skill-body` |
| `registerTimer` | `timer` |
| `registerDeployStrategy` | `deploy` |
| `registerShift` | `shift` |
| `registerTerrain` | `terrain` |
| `registerZone` | `zone` |
| `registerAttackSubstitute` | `attack-substitute` |
| `registerAttackSegment` | `attack-segment` |
| `registerSystem` | 槽名不在 `PHASE_SLOTS` 里时是 `phase` |
| `registerTag` | 规格写到未注册的标签时是 `tag`，见 [世界、组件、资源与标签](./05-world.md) |

规格点了没有传入的模块，或依赖不在规格名单里，`registry` 是 `module`。

## 扩展

```ts
import {
  defineExtensible,
  type MissionModule,
  type SelectorDefinition,
} from "arknights-mission-core"

const DISTANCE = defineExtensible("distance", {
  version: 1,
  contract: "selector",
})

export const nearestFirst: MissionModule = {
  id: "nearest-first",
  install(reg) {
    reg.wrap(
      DISTANCE,
      (inner): SelectorDefinition => ({
        ...inner,
        compare: (left, right, ctx, query) =>
          -inner.compare(left, right, ctx, query),
      }),
    )
  },
}
```

- `markExtensible(key)` 把自己登记的 id 标成可扩展
- `replace(key, definition)` 换掉当前那一项
- `wrap(key, (inner) => definition)` 拿到当前那一项，返回新的一项

- 只有标成可扩展的 id 能被 `replace` 或 `wrap`，否则抛出 `ExtensionRefusedError`；键里的契约与版本要与标记时一致，替换项的 id 要与键相同。
- `contract` 是注册表名：`skill-body`、`skill-trigger`、`selector`、`damage-step`、`stacking`、`condition`、`deploy`、`element`、`terrain`、`zone`，包根的 `EXTENSIBLE_CONTRACTS` 就是这份名单。
- `replace` 与 `wrap` 都作用在当前那一项上，按调用先后一层层叠：先 `replace` 再 `wrap`，包住的是替换后的那一项。
- 内置的技能体、技能触发、选择器、伤害步骤、叠加策略、条件与元素已经标成可扩展；系统与组件不开放替换。
- 每次替换按安装它的模块记进替换链，计入 `contentHash`。

`subscribe(type, handler)` 返回取消订阅的函数。处理函数收到事件和 `ContentContext`，缓冲里仍保留这条事件，直到 `drainEvents`。可拦截的事件（`BattleEventMap` 里写成 `Intercept<数据>`）在 `ctx.intercept` 时同步分发，处理函数拿到可写的 `data`；只读事件用 `ctx.emit` 发出，处理函数里再发的只读事件排队，等当前这条分发完按先进先出分发。见 [战斗](./03-battle.md#事件)。

`registerDamageStep` 的 `priority` 小的先执行。换掉同名步骤后按新的优先级重排。内置步骤见 [伤害](./06-damage.md)。

`PhaseSystem` 有 `id`、`slot`、`priority`、`run(ctx)`，可选的 `before` 与 `after` 是同槽里要排在它后面、前面的系统 id。

系统 id 在一场战斗里唯一，重复登记时创建失败。顺序规则与 `systemOrder()` 见 [战斗](./03-battle.md#阶段槽)。

- 计时器登记后，要用 `startTimer(unitId, timerId)` 才开始推进。
- 系统里可以用 `advanceStartedTimers(slot)` 推进这个槽上所有已经开始的计时器，内置的友方槽就是这样走的。
- 规格 `timers` 里列出的 id，引擎自己启动。
- 定义上的 `sides` 不包含这个单位的阵营时，`startTimer` 不启动，视图保持未开始。
- `advanceTimer` 推进一份，还没开始会失败。
- `timerView` 没开始时是 `{ started: false }`。
- 攻击视图有 `phase`、`elapsed`。
- 技力视图有 `phase`、`elapsed`、`sp`、`charges`、`active`、`activations`。
- `charge` 有 `stored`、`elapsed`。
- `ammo` 有 `ammo`、`elapsed`。
- `boomerang` 有 `out`、`elapsed`。
- 出手要读的 `readAttackTiming` 见 [计时](./09-timer.md)。

部署策略：

`DeployStrategyDefinition` 有 `id` 与三个函数：`opening(ctx)`、`downedTile(unitId, ctx)`、`canStand(unitId, tile, ctx)`。

`opening` 返回开场要上场的单位 id。倒地时 `downedTile` 给出落点，引擎把坐标写成这个格子，再用 `canStand` 问这一格现在能不能站。结果放进 `downed` 事件。`canStand` 为假时落点不变。

内置模块 `deploy`（`deployModule`）登记同名策略。规格同时写 `modules: ["deploy"]` 和 `deployStrategy: "deploy"`。常量 `DEPLOY_STRATEGY` 与标签键 `TOKEN`、`DEFER_DEPLOY` 从包根导出。

带 `token` 标签的是召唤物。带 `defer-deploy` 的是开战不上场的友方，它的初始格子留着。初始格子是放入时的坐标，之后 `displace` 可以离开，初始格子不变。

`opening` 先按放入顺序列出敌人，再列干员，再列召唤物。干员和召唤物按初始格子排：列号小的在前，同一列行号大的在前，再比 id。带 `defer-deploy` 的友方和初始格子不在地图格子里的友方不在这份名单里。

干员的倒地落点是当前坐标四舍五入后的格子。这个格子是另一名友方的初始格子，并且自己的初始格子 `canStand` 为真时，落点改回初始格子。召唤物和敌人留在倒下的格子。这条策略不读取推、拉或恐惧的落点。

`canStand` 看三件事：地块存在且 `deployable` 为真；没有另一名在场单位站在这里；没有另一名倒地干员的当前格子，或一名还没上场的友方的初始格子，落在这里。正在问的这名单位自己不算。召唤物倒地之后不占格。地块高度和 `deployPositions` 留给内容自己的策略，用来判断高台、近战位和远程位。

再部署用倒地之后已经写下的坐标，不调用 `opening` 和 `downedTile`。有部署策略时，回来之前用 `canStand` 看当前这一格；站不住就继续等。内容排下的再部署带落点时看落点。

`spawnUnit` 和 `displace` 在规格写了部署策略时先问 `canStand`。站不住就不放入、不改坐标。没有策略时这两条命令不看格子。

## 命令和查询

- `dealDamage`、`previewDamage`、`loseHp`、`heal`、`addElement` 见 [伤害](./06-damage.md)。
- `applyEffect`、`removeEffect` 见 [效果与属性](./10-effect.md)。
- `unitsInRange`、`select`、`hitRect` 见 [选择器](./11-selector.md)。
- `shouldCast`、`castSkill`、`gainSp`、`readySkill`、`configureSkill` 见 [技能](./07-skill.md)。
- `setModifier`、`clearModifier`、`hasModifier` 见 [带时限的修饰](./10-effect.md#带时限的修饰)。

- `spawnUnit(spec)` 放入单位并标成在场，授予规格标签，送出 `spawn`。
- `kind: "device"` 时放入的是装置，倒下就是被摧毁并被移除。
- `spawnUnit` 不装技能计时。
- `removeUnit(unitId)` 让单位离场且不再回来，送出 `removed`，下一次快照起不再出现。
- 规格里有未注册的标签时抛出 `UnknownRegistrationError`。
- 规格写了部署策略时，`canStand` 为假就不放入。
- `displace(unitId, x, y)` 改坐标，清掉这条路线已经算好的路径，送出 `displace`。
- 有部署策略且 `canStand` 为假时，`displace` 不改坐标。
- `shift` 见 [费用、阻挡与投射物](./12-field.md)。
- `setObstacle(x, y, on, kind?)` 在格子上摆障碍，`kind` 缺省 `block`，也可以是 `crate`。
- `setTerrain(x, y, id | null)` 改一格的地形，`terrainAt(x, y)` 读当前地形，见 [地形](./14-terrain.md)。

- `launchProjectile` 从来源单位的坐标发出一发，送出 `projectile`。
- 可选 `speed` 是格/秒，缺省 `PROJECTILE_SPEED`（12）。
- `projectiles()` 读出仍在飞的那些，带当前 `x`、`y`。
- 投射物槽里朝目标飞；目标已离场则消掉，不结算。
- `retain` 为真时落到最后坐标再结算。
- 没有 `attack` 时到达后按 `amount` 造成 `physical` 伤害。
- 超过 `PROJECTILE_MAX_AGE`（10 秒）仍未飞到，就落在目标当前位置并结算。
- 普攻只在 `attackShape.projectile` 上写了种类时改走投射物。

- `retreatUnit(unitId)` 撤下在场的单位：开着的技能以 `retreat` 结束，开始再部署计时，送出 `retreat`。
- 撤下不算倒下，不送 `downed`，账本不记。
- `redeployUnit(unitId, order?)` 让等待再部署的单位回来。
- `order` 可以给 `tile`（落点）、`delay`（再等的秒数，0 是立即）、`cost`（回来时扣的费用，0 是免费）与 `keepSp`（保留技力与充能）；不给的按规则：等再部署计时、扣单位的 `cost`、按入场重新打开技能。
- `delay` 是 0 时这一拍就回来；不是 0 时排下，由再部署模块从排下时的计时起算，到点执行，没装再部署模块时拒绝（`no-redeploy`）。
- 两条命令与玩家的 `retreat`、`redeploy` 输入同一段实现，生效返回 `null`，否则返回原因（见 [战斗](./03-battle.md#玩家输入)），不送 `input-refused`。
- `unbalanced(unitId)` 读这一拍是否失衡，`cutUnbalance(unitId)` 立刻结束失衡，见 [费用、阻挡与投射物](./12-field.md#失衡)。

- `spendCost(side, amount)` 从该阵营的池里扣。
- 费用不够，或数额不是有限非负数时，`spendCost` 返回 false，池子不动。
- 0 视为已经付过，返回 true。
- `addCost(side, amount)` 加上去，结果不超过规格里的上限。
- `costOf(side)` 读当前数量。
- 见 [费用、阻挡与投射物](./12-field.md)。

- `schedule(tick, run)` 把回调交给 `schedule` 槽。
- `finish(winner)` 写下胜负。
- `tick()` 读当前拍数。
- `tile(x, y)` 读地块，没有则是 `null`。
- `random` 是这场战斗的发生器。
- `field()` 读规格的 `notes`，`script(unitId)` 读单位规格的 `script`，都是只读的纯数据，没有时是空记录。

`component(key)` 返回 `defineComponent` 定义的按单位组件表，`resource(key)` 返回 `defineResource` 定义的本场资源。`hasTag`、`grantTag`、`revokeTag`、`tagSources` 按 `defineTag` 的键查询和授予标签。见 [世界、组件、资源与标签](./05-world.md)。

`unit(unitId)` 读一份视图：id、阵营、坐标、生命与最大生命、`alive`、`fielded`、`downed`、朝向、移动方式。`units(side?)` 按入场顺序列出单位 id，缺省两边都列；`attribute(unitId, key)` 读算上效果与修饰的属性。视图不带标签，标签一律用 `hasTag(unitId, key)` 按键查（含蕴含得到的标签）；需要分来源时用 `tagSources(unitId, key)`。

## 随机数

- `random` 实现 `Random`。
- 直接调用返回 `[0, 1)`。
- `int(n)` 返回 `[0, n)` 的整数。
- `range(a, b)` 返回 `[a, b)`。
- `chance(p)` 在下一次取样小于 `p` 时为真。
- `pick` 在空数组上返回 `undefined`。
- `shuffle` 就地打乱。
- `weighted` 用非负权重；总权重不大于 0 时返回 `undefined`。
- `state()` 读内部状态，`restore(state)` 回到读出时的状态。

`createRandom(seed)` 和 `deriveSeed(seed, salt)` 也从包根导出。战斗本身用规格里的 `seed`，内容用上下文上的 `random`。
