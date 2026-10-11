---
title: 追溯标记
description: 代码里的 TRACE 标记指向这张表，表里写明每条规则的出处与依据。
---

# 追溯标记

代码、注释、测试名与报错只写当前代码在做什么。规则或数值需要指向外部出处时，代码里只留一个标记，说明集中写在这张表里。

## 写法

标记单独占一行，放在相关代码的上一行，行内不写其他文字：

```ts
// TRACE: source/deterministic-math
export function hypot(x: number, y: number): number {
```

一处引用多条时用逗号分隔：`// TRACE: source/a, assumed/b`。JSON 数据不能写注释，由表格的「位置」列指向数据路径。

| 种类 | 含义 |
|---|---|
| `assumed` | 沿用参考实现中标为假定的规则或数值，尚无官方资料印证 |
| `source` | 行为或数值的出处：参考实现的文件与设计记录，或官方数据字段 |
| `interim` | 实施期间的限制，说明写在 `plans/` 的对应步骤里，不进这张表 |

## 检查

每个引擎包的 `test/trace.spec.ts` 用 TypeScript 扫描器读取注释、测试名与报错文案，并检查：

- 标记的写法；每个 `assumed`、`source` 标记都在本表对应包的一节里，表里每一行至少被引用一次；每个 `interim` 标记都能在 `plans/` 中找到。
- 注释、测试名与报错文案中不出现参考实现的文件路径、文件名、设计记录小节号，以及待办或实施期字样。命中即失败，报出文件与行号，没有豁免名单。

在 `mission-core` 内运行：

```sh
pnpm test
```

## mission-core

| id | 规则 | 位置 | 来源 | 依据 | 核对 |
|---|---|---|---|---|---|
| `assumed/cold-pair-max` | 寒冷叠寒冷时冻结取两段中更长的，不分寒冷来自哪个阵营 | `ability/effect/catalog.ts`（`freezeFromCold`） | 参考实现 `server/sim/battle/status.js`（`applyStatus` 的寒冷分支），设计记录 0.2.0 寒冷转冻结 | PRTS 术语释义「寒冷」只在友方寒冷一条写明「持续时间取双方之中最高」，引擎只有一种寒冷，敌方施加的寒冷沿用同一条 | 已按参考实现核对 |
| `assumed/max-hp-ratio` | 最大生命变化时在场单位的当前生命按新旧上限之比缩放，夹在 0 到新上限，不取整；不在场或倒下时只记新上限。结算在拍内第一次读到最大生命时，没人读时在拍末 | `ability/effect/attribute.ts`（`maxHpOf`）、`battle/step.ts`（`engine:max-hp`） | 参考实现 `server/sim/units.js`（属性重算时 `hp × maxHp / prevMax`），用例 `core.test.js` stat aggregation | 比例、夹取与浮点来自参考实现；参考实现在属性脏后下一次读取时重算，结算时刻随读取而定，这里固定为拍内首次读取或拍末，属于假定 | 已按参考实现核对 |
| `source/latest-deployed` | 用部署策略时，敌人的「最后部署的目标」按部署先后：开场按名单（干员按列从左到右、同列从上到下，再召唤物）排仇恨序，开场时随干员放进来的召唤物排在名单之后；战斗中放进来的友方与再部署的友方排到最后 | `unit/record/index.ts`（`markLatestDeployed`）、`unit/deploy/strategy.ts`、`unit/deploy/command.ts` | PRTS 作战机制「索敌」，PRTS 卫戍协议/帮助；参考实现用例 `playtest5-targeting.test.js` #5 | 「仇恨值…最后部署的目标」；「按从上到下>从左到右的顺序部署。优先部署干员，随后为召唤物」 | 已按参考实现核对 |
| `source/fly-over-block` | `targetPriority` 为 `fly` 的友方（速射手）范围里有飞行敌人时，先打飞行的，不先打自己挡着的地面敌人；别的特殊优先级（如神射手）仍先打挡着的 | `combat/target/catalog.ts`（`blockRank`） | 参考实现用例 `playtest5-targeting.test.js` #220（所有者 2026-10-08 的决定） | 速射手「优先攻击空中单位」压过阻挡优先 | 已按参考实现核对 |
| `source/deterministic-math` | `hypot`、`powi`、`sin`、`cos`、`atan2` 只用正确舍入的运算，各引擎逐位一致 | `kernel/math/hypot.ts`、`kernel/math/powi.ts`、`kernel/math/trig.ts` | 参考实现 `server/sim/detmath.js`，设计记录 0.2.2 §27.1；`sin`、`cos`、`atan2` 是 fdlibm 5.3 与 FreeBSD msun 的算法 | 规范允许 `Math.hypot` 等返回近似值，各引擎末位不同；逐位与参考实现一致（用例固定了同一组摘要） | 已按参考实现核对 |
| `source/attack-stand` | 敌人命中后站到攻击片段放完（没有片段时 0.35 秒，被麻痹打断时没被阻挡的远程敌人也站 0.35 秒）；没被阻挡、攻击范围不为空的敌人在前摇里也站着；`attack-moves` 不站；站定只停行走，等待、消失、出现照常推进；无法行动、路线消失、倒下离场、位移时作废，恐惧时不站 | `combat/attack/stand.ts`（`standAfterStrike`）、`combat/attack/index.ts`（`strike`、`attackWillWind`）、`battle/step.ts`（`engine:enemy-route`） | 参考实现 `server/sim/ai.js`（`attackStand`、`updateEnemy`、`advanceRoute`）、`server/sim/battle/events.js`（`stand`、`standCut`）；GitHub #58 | 攻击动作播放期间敌人不走，片段放完再走 | 已按参考实现的 feedback2-enemy-attack-stand 用例核对 |
| `source/enemy-swing` | 开始一下出手时，冷却在这一拍之前就已经在前摇以内（没有目标、前摇被晕眩或缴械打断、刚解除控制），从头走完整个前摇；冷却这一拍才降进前摇的，前摇就是余下的冷却 | `combat/attack/index.ts`（`openSwing`） | 参考实现 `server/sim/ai.js`（`enemyAttack` 的 `prevCd < wind`）；GitHub #187、#170；PRTS 异常效果 STUNNED / DISARMED「正在进行的普通攻击将被中断」 | 短时晕眩能打断敌人普攻 | 已按参考实现的 feedback5-enemy-swing 用例核对 |
| `source/unbalance` | 推、拉让敌人失衡：推按受力等级的位移时间，拉按作用时间（受力等级 < −1 减半），保底 0.1 秒；失衡期间不走、不开始普攻、前摇被打断；静态刚体不动也失衡，位移免疫不失衡；浮空、出现结束失衡 | `field/motion/unbalance.ts`（`PUSH_UNBALANCE`、`unbalanceUnit`）、`field/motion/index.ts`（`push`、`pull`） | 参考实现 `server/sim/battle/displacement.js`（`_unbalance`、`_staticForce`）、`server/sim/constants.js`（`PUSH_UNBALANCE`）、`server/sim/ai.js`；PRTS 失衡位移机制、游戏数据基础推力-位移近似对应表、推与拉、特殊机制静态刚体 | 推拉后敌人短暂停住、普攻被打断 | 已按参考实现核对规则；逐拍边界按核心的拍序定义（施加的这一拍起算，`until` 不含） |
| `source/block-targets` | `blockTargets` 形状的一次攻击打阻挡数个目标，不低于 1，阻挡的敌人在前 | `combat/target/aim.ts`（`attackTargetIds`） | 参考实现 `server/sim/ai.js` 的 `acquireTargets` / `targetCount`（`hitAllBlocked`）；PRTS 分支特性 强攻手 等"普通攻击最大目标数等于阻挡数（不会低于1）" | 强攻手、重剑手、推击手这类分支由数据写 `blockTargets` | 已按参考实现的 feedback5-block-targets 用例核对 |
| `source/down-effects` | 友方倒下或撤下时取下身上的效果（各调用一次 onRemove），定义写了 `keepOnDown` 的留着 | `ability/effect/index.ts`（`dropEffectsOnDown`）、`unit/deploy/strategy.ts`、`unit/deploy/command.ts` | 参考实现 `server/sim/battle/deploy.js` 的移除流程（keep persistent buffs only） | 特性、天赋这类常驻效果写 `keepOnDown` | 已按参考实现的 core 用例核对 |
| `source/extra-range` | 内容加进攻击范围的绝对格子，换位置、换范围之后都留着，直到内容重新设置；不进技能触发的初始范围 | `combat/target/selector.ts`（`EXTRA_RANGE`、`setExtraRange`） | 参考实现 `server/sim/battle/queries.js` 的 `setExtraRange`、`_refreshRange` | 指定目标、额外目标格这类内容能让单位打到范围外的格子 | 已按参考实现的 engine-requests 用例核对 |
| `source/trigger-area` | 内容登记的技能触发区域（绝对格子或某个单位当前的攻击范围）里有敌人时，非治疗技能每拍按 DEFAULT 释放，攻击者也不等攻击 | `ability/skill/trigger.ts`（`TRIGGER_AREAS`、`areaTriggerMet`）、`ability/skill/point.ts`（`consider`） | 参考实现 `server/sim/skills.js` 的 `addTriggerRange`、`_extraTriggerSatisfied`（TRIGGER_PROFILE：飞行的也算） | 召唤物或光束等区域里有敌人就放技能 | 已按参考实现的 engine-requests 用例核对 |
| `source/range-extend-base` | 攻击距离分永久（`rangeExtendBase`）与随技能、限时效果撤下的（`rangeExtend`）两份；普攻范围算两者之和，技能触发（`DEFAULT` 的范围、`ACTIVE_RANGE` 的触发范围、友方触发的范围）只算永久的 | `combat/target/selector.ts`（`RANGE_EXTEND_BASE`、`baseRange`） | 参考实现 `server/sim/units.js` 的 `baseRangeExtend`（permRangeExtend）、`server/sim/skills.js` 的 `_defaultCondition` 与 `_triggerKeys` | 技能延伸的距离不让技能自己提前触发 | 已按参考实现核对 |
| `source/active-range` | 持续时攻击范围严格大于自身范围的技能，基础策略的条件放到持续时的范围上，每拍都问，不等攻击 | `ability/skill/trigger.ts`（`activeRange`） | 参考实现 `server/sim/skills.js` 的 ACTIVE_RANGE（项目所有者 2026-10-05 的规则，有意偏离官方） | 技能不必等普攻命中，敌人一进持续范围就放 | 已按 feedback5-active-range 用例核对；哪些技能用这条由 app/data 编译 |
| `source/blocked-first` | 自己挡着的敌人总是阻挡者的目标，基础策略的技能条件也算它，在不在攻击范围里都一样 | `ability/skill/trigger.ts`（`holdsEnemy`） | 参考实现 `server/sim/skills.js` `_defaultCondition`；PRTS 卫戍协议/帮助「敌人被近战干员自身阻挡」；用户 playtest #6 | 远程站近战位也为挡住的敌人放技能 | 已按 playtest5_blocking 用例核对 |
| `source/element-order` | 元素槽给画面的显示值取最满的一槽，一样满时按 `neural`、`erosion`、`burn`、`apoptosis`、`necrosis` 的先后取 | `combat/element/index.ts`（`ELEMENT_ORDER`，内置元素定义的 `order`）；比较在 `combat/element/gauge.ts`（`ELEMENT_GAUGES` 的 view） | 参考实现 `server/sim/constants.js`（`ELEMENT_ORDER`）、`server/sim/damage.js`（`elementView`） | 官方元素 id 的先后；画面只显示一个元素图标 | 已按参考实现核对先后顺序 |
| `source/immunity-names` | 免疫名单用免疫名：冻结是 `frozen`，恐惧和战栗是 `feared`，其余与状态 id 相同 | `contract/spec.ts`（`UnitSpec.immunity`）、`ability/effect/immunity.ts`、`port/definition.ts`（`EffectDefinition.immunity`） | 参考实现 `server/sim/buffs.js` 状态表的 `immune` 字段 | 关卡与内容数据沿用这套名字，兼容层不必转换 | 未核对 |
| `source/loadout-compose` | 带模块的属性是无模块属性加模块的平加值并保留六位小数；天赋按序号覆盖，模块未写的键保留，其余追加，空占位丢弃 | `port/loadout.ts`（`composeStats`、`composeTalents`） | 参考实现 `tools/build-data.mjs`（`mergeTalentChanges`）、`shared/loadoutRecord.js` | 与数据构建时的合并规则一致，详情卡与战斗读到同一组数 | 未核对 |
| `source/loadout-range` | 部署时的攻击范围：技能写明「被动效果：攻击范围扩大」用技能范围；精英且模块写明「攻击范围扩大」用模块范围；否则用记录范围；再加特性的永久攻击距离 | `port/loadout.ts`（`attackRangeGrid`） | 参考实现 `shared/loadoutRecord.js`，设计记录 DESIGN §16 | 官方技能与模块描述的文字约定 | 未核对 |
| `source/range-extend` | 攻击距离增加 n 时，范围每一行在最远端外补上 1…⌊n⌋ 格，去重，丢弃无效项 | `port/loadout.ts`（`extendedGrid`） | 参考实现 `server/sim/targeting.js`（`absoluteRangeKeys`），设计记录 DESIGN §3 | 官方「攻击距离 +1」按行向前延伸 | 未核对 |
