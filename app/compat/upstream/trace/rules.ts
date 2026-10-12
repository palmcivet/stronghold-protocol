import type { TraceRule } from '#trace/schema.js';

/**
 * 引擎规则的追溯表：每条规则的出处、依据与核对状态，以及在 next 里锁住它的用例。
 */
export const TRACE_RULES: readonly TraceRule[] = [
  {
    id: 'assumed/cold-pair-max',
    package: 'mission-core',
    rule: '寒冷叠寒冷时冻结取两段中更长的，不分寒冷来自哪个阵营',
    location: '`ability/effect/catalog.ts`（`freezeFromCold`）',
    source:
      '参考实现 `server/sim/battle/status.js`（`applyStatus` 的寒冷分支），设计记录 0.2.0 寒冷转冻结',
    basis:
      'PRTS 术语释义「寒冷」只在友方寒冷一条写明「持续时间取双方之中最高」，引擎只有一种寒冷，敌方施加的寒冷沿用同一条',
    verified: '已按参考实现核对',
    next: [
      'mission-core/test/ability/effect/cold.spec.ts::寒冷 10 秒后紧接 1 秒寒冷：冻结取更长的 10 秒，这对寒冷变成冻结，冻结中法抗 −15',
      'mission-core/test/ability/effect/cold.spec.ts::寒冷 1 秒后接 8 秒寒冷：冻结 8 秒',
      'mission-core/test/ability/effect/cold.spec.ts::较短的第二次寒冷不缩短剩余更长的寒冷给出的冻结',
      'mission-core/test/ability/effect/cold.spec.ts::友方的两次寒冷照样冻结，寒冷留在身上',
    ],
  },
  {
    id: 'assumed/max-hp-ratio',
    package: 'mission-core',
    rule: '最大生命变化时在场单位的当前生命按新旧上限之比缩放，夹在 0 到新上限，不取整；不在场或倒下时只记新上限。结算在拍内第一次读到最大生命时，没人读时在拍末',
    location:
      '`ability/effect/attribute.ts`（`maxHpOf`）、`battle/step.ts`（`engine:max-hp`）',
    source:
      '参考实现 `server/sim/units.js`（属性重算时 `hp × maxHp / prevMax`），用例 `core.test.js` stat aggregation',
    basis:
      '比例、夹取与浮点来自参考实现；参考实现在属性脏后下一次读取时重算，结算时刻随读取而定，这里固定为拍内首次读取或拍末，属于假定',
    verified: '已按参考实现核对',
    next: [
      'mission-core/test/ability/effect/max-hp.spec.ts::最大生命翻倍时当前生命跟着翻倍，效果取下时按比例回落；拍内一读到就已经跟上',
      'mission-core/test/ability/effect/max-hp.spec.ts::受伤之后上限再变按当时的比例算：1000/2000 掉到 600 后上限回到 1000，生命是 300',
      'mission-core/test/ability/effect/max-hp.spec.ts::不在场时上限变化只记下来，不缩放生命；再上场之后的变化照常缩放',
      'mission-core/test/ability/effect/max-hp.spec.ts::快照的 maxHp 是生效的最大生命，attributes.maxHp 仍是基础值；读快照不结算缩放',
    ],
    upstreamCases: [
      'sim/core.test.js::stat aggregation: (base+flat)(1+pct)Πmul, res clamp, aspd clamp, interval, HP ratio kept',
    ],
  },
  {
    id: 'assumed/condition-every-tick',
    package: 'mission-core',
    rule: '条件效果（如模组的「攻击范围内存在 2 名及以上敌人时攻击速度 +12」）每拍重新判断一次：条件成立的那一拍挂上，不成立的那一拍取下',
    location: '`ability/effect/condition.ts`（`registerConditionSystem`）',
    source:
      '参考实现 `server/sim/content/traitMods.js`（`installTraitAttackSpeed`），设计记录 0.2.2 §27.15',
    basis:
      '官方没有写明检查频率；参考实现每拍检查，并注明官方频率未记载（此前干员各自的 0.2 秒轮询同样没有依据）',
    verified: '已按参考实现核对',
    next: [
      'mission-core/test/battle/content.spec.ts::条件效果：攻击范围内有敌人时挂上，敌人离开或倒下时取下',
    ],
  },
  {
    id: 'source/latest-deployed',
    package: 'mission-core',
    rule: '用部署策略时，敌人的「最后部署的目标」按部署先后：开场按名单（干员按列从左到右、同列从上到下，再召唤物）排仇恨序，开场时随干员放进来的召唤物排在名单之后；战斗中放进来的友方与再部署的友方排到最后',
    location:
      '`unit/record/index.ts`（`markLatestDeployed`）、`unit/deploy/strategy.ts`、`unit/deploy/command.ts`',
    source:
      'PRTS 作战机制「索敌」，PRTS 卫戍协议/帮助；参考实现用例 `playtest5-targeting.test.js` #5',
    basis:
      '「仇恨值…最后部署的目标」；「按从上到下>从左到右的顺序部署。优先部署干员，随后为召唤物」',
    verified: '已按参考实现核对',
    next: [
      'mission-core/test/combat/target/targeting.spec.ts::#5 没被挡的远程敌人：嘲讽高的在前，其次最晚部署的——开场按列从左到右、同列从上到下部署，最右一列的最下面最晚',
      'mission-core/test/combat/target/targeting.spec.ts::#5 开场先部署干员再部署召唤物，召唤物最吸引火力；开场时随干员放进来的召唤物也排在所有干员之后；再部署的又是最晚的',
      'mission-core/test/unit/deploy/board.spec.ts::开战按列从上到下，干员先于召唤物，推迟的不上场',
    ],
    upstreamCases: [
      'sim/playtest5-targeting.test.js::#5 unblocked ranged enemies: highest taunt, then the latest deployed — the rightmost column, its bottom (从上到下 > 从左到右: down each column, the columns left to right)',
      'sim/playtest5-targeting.test.js::#5 the initial deployment puts every operator before the summons (PRTS 卫戍协议/帮助) — a summon piece draws the fire',
    ],
  },
  {
    id: 'source/fly-over-block',
    package: 'mission-core',
    rule: '`targetPriority` 为 `fly` 的友方（速射手）范围里有飞行敌人时，先打飞行的，不先打自己挡着的地面敌人；别的特殊优先级（如神射手）仍先打挡着的',
    location: '`combat/target/catalog.ts`（`blockRank`）',
    source:
      '参考实现用例 `playtest5-targeting.test.js` #220（所有者 2026-10-08 的决定）',
    basis: '速射手「优先攻击空中单位」压过阻挡优先',
    verified: '已按参考实现核对',
    next: [
      'mission-core/test/combat/target/targeting.spec.ts::#220 优先攻击空中单位的干员挡着地面敌人时先打范围里的飞行敌人；别的特殊优先级仍先打挡着的',
    ],
    upstreamCases: [
      "sim/playtest5-targeting.test.js::#220 (the owner's decision of 2026-10-08): a 速射手 blocking a ground enemy shoots a flyer in its range; a 神射手 keeps hitting the enemy it blocks",
    ],
  },
  {
    id: 'source/deterministic-math',
    package: 'mission-core',
    rule: '`hypot`、`powi`、`sin`、`cos`、`atan2` 只用正确舍入的运算，各引擎逐位一致',
    location:
      '`kernel/math/hypot.ts`、`kernel/math/powi.ts`、`kernel/math/trig.ts`',
    source:
      '参考实现 `server/sim/detmath.js`，设计记录 0.2.2 §27.1；`sin`、`cos`、`atan2` 是 fdlibm 5.3 与 FreeBSD msun 的算法',
    basis:
      '规范允许 `Math.hypot` 等返回近似值，各引擎末位不同；逐位与参考实现一致（用例固定了同一组摘要）',
    verified: '已按参考实现核对',
    next: [
      'mission-core/kernel/math/hypot.test.ts::hypot > results are pinned bit for bit',
      'mission-core/kernel/math/hypot.test.ts::hypot > is the correctly rounded square root where engines differ',
      'mission-core/kernel/math/hypot.test.ts::hypot > stays within 1 ulp of the exact value',
      'mission-core/kernel/math/hypot.test.ts::hypot > is symmetric in sign and argument order',
      'mission-core/kernel/math/hypot.test.ts::hypot > rescales outside 2^±500',
      'mission-core/kernel/math/hypot.test.ts::hypot > special values follow the language specification',
      'mission-core/kernel/math/powi.test.ts::powi > results are pinned bit for bit',
      'mission-core/kernel/math/powi.test.ts::powi > is correctly rounded where engines differ',
      'mission-core/kernel/math/powi.test.ts::powi > is correctly rounded on the stack and bounce grid',
      'mission-core/kernel/math/powi.test.ts::powi > is correctly rounded for any base in [0, 3] and exponent up to 40 away from underflow',
      'mission-core/kernel/math/powi.test.ts::powi > special values follow the language specification',
      'mission-core/kernel/math/powi.test.ts::powi > rejects a non-integer exponent',
      'mission-core/kernel/math/trig.test.ts::sin and cos > results are pinned bit for bit',
      'mission-core/kernel/math/trig.test.ts::sin and cos > give the fdlibm results where engines differ',
      'mission-core/kernel/math/trig.test.ts::sin and cos > keep their symmetries',
      'mission-core/kernel/math/trig.test.ts::sin and cos > stay on the unit circle',
      'mission-core/kernel/math/trig.test.ts::sin and cos > special values follow the language specification',
      'mission-core/kernel/math/trig.test.ts::atan2 > results are pinned bit for bit',
      'mission-core/kernel/math/trig.test.ts::atan2 > gives the fdlibm result where engines differ',
      'mission-core/kernel/math/trig.test.ts::atan2 > is odd in y and inverts sin and cos',
      'mission-core/kernel/math/trig.test.ts::atan2 > special values follow the language specification',
    ],
  },
  {
    id: 'source/attack-stand',
    package: 'mission-core',
    rule: '敌人命中后站到攻击片段放完（没有片段时 0.35 秒，被麻痹打断时没被阻挡的远程敌人也站 0.35 秒）；没被阻挡、攻击范围不为空的敌人在前摇里也站着；`attack-moves` 不站；站定只停行走，等待、消失、出现照常推进；无法行动、路线消失、倒下离场、位移时作废，恐惧时不站',
    location:
      '`combat/attack/stand.ts`（`standAfterStrike`）、`combat/attack/index.ts`（`strike`、`attackWillWind`）、`battle/step.ts`（`engine:enemy-route`）',
    source:
      '参考实现 `server/sim/ai.js`（`attackStand`、`updateEnemy`、`advanceRoute`）、`server/sim/battle/events.js`（`stand`、`standCut`）；GitHub #58',
    basis: '攻击动作播放期间敌人不走，片段放完再走',
    verified: '已按参考实现的 feedback2-enemy-attack-stand 用例核对',
    next: [
      'mission-core/test/combat/attack/stand.spec.ts::敌人出手站定 > 有攻击片段时站过前摇与命中后的余下片段，两次出手之间照走',
      'mission-core/test/combat/attack/stand.spec.ts::敌人出手站定 > 出手比片段快时片段一起变短，有目标期间一直站着',
      'mission-core/test/combat/attack/stand.spec.ts::敌人出手站定 > 不停止移动的攻击者边走边打，同一个敌人没有这个标签时站定',
      'mission-core/test/combat/attack/stand.spec.ts::敌人出手站定 > 没有片段时命中后站 0.35 秒、没有前摇站定；晕眩打断站定，晕眩结束后接着走',
      'mission-core/test/combat/attack/stand.spec.ts::敌人出手站定 > 命中后站定期间被晕眩：站定作废并记下打断的拍，晕眩结束后接着走',
      'mission-core/test/combat/attack/stand.spec.ts::敌人出手站定 > 站定只停住行走：等待照常走完，出手比片段快的敌人在目标还在时不离开',
      'mission-core/test/combat/attack/stand.spec.ts::敌人出手站定 > 站定期间路线照常消失与出现，消失时站定作废',
      'mission-core/test/combat/attack/stand.spec.ts::敌人出手站定 > 位移打断站定',
    ],
    upstreamCases: [
      'sim/feedback2-enemy-attack-stand.test.js::隐形弩手 with an operator in range stands for its 1.0 s Attack clip at every attack (0.533 s wind-up + 0.467 s), then walks',
      'sim/feedback2-enemy-attack-stand.test.js::the stand shortens with the clip when the attacks come quicker than the clip: an enemy attacking every 1 s with a 2 s clip never walks while it has a target',
      'sim/feedback2-enemy-attack-stand.test.js::a 「不停止移动」 attacker (attackMoves) keeps walking through its attacks',
      'sim/feedback2-enemy-attack-stand.test.js::no attack clip known: ATTACK_PAUSE after the strike and no wind-up stand; a stun cuts a stand short',
      'sim/feedback2-enemy-attack-stand.test.js::a ranged enemy with a target in range on a WAIT checkpoint leaves when the wait (and its current clip) is over, as without a target',
      'sim/feedback2-enemy-attack-stand.test.js::DISAPPEAR / APPEAR legs proceed while an enemy stands for its attacks; leaving the field ends the stand',
    ],
  },
  {
    id: 'source/enemy-swing',
    package: 'mission-core',
    rule: '开始一下出手时，冷却在这一拍之前就已经在前摇以内（没有目标、前摇被晕眩或缴械打断、刚解除控制），从头走完整个前摇；冷却这一拍才降进前摇的，前摇就是余下的冷却',
    location: '`combat/attack/index.ts`（`openSwing`）',
    source:
      '参考实现 `server/sim/ai.js`（`enemyAttack` 的 `prevCd < wind`）；GitHub #187、#170；PRTS 异常效果 STUNNED / DISARMED「正在进行的普通攻击将被中断」',
    basis: '短时晕眩能打断敌人普攻',
    verified: '已按参考实现的 feedback5-enemy-swing 用例核对',
    next: [
      'mission-core/test/combat/attack/swing.spec.ts::敌人出手的前摇与打断 > 被阻挡的敌人冷却走完就开始前摇，在命中点出手，之后每个攻击间隔一次',
      'mission-core/test/combat/attack/swing.spec.ts::敌人出手的前摇与打断 > 命中点之前 0.1 秒的晕眩打断这一下，晕眩结束后重新走完整个前摇',
      'mission-core/test/combat/attack/swing.spec.ts::敌人出手的前摇与打断 > 命中点之前 0.2 秒的晕眩打断这一下，晕眩结束后重新走完整个前摇',
      'mission-core/test/combat/attack/swing.spec.ts::敌人出手的前摇与打断 > 冷却中的晕眩只让冷却停下，不重新前摇',
      'mission-core/test/combat/attack/swing.spec.ts::敌人出手的前摇与打断 > 缴械像晕眩一样打断前摇，结束后重新走完整个前摇',
      'mission-core/test/combat/attack/swing.spec.ts::敌人出手的前摇与打断 > 已经出手的一箭照常飞到，出手后的晕眩不撤回',
      'mission-core/test/combat/attack/swing.spec.ts::敌人出手的前摇与打断 > 没有攻击片段时没有前摇，第一拍就出手，晕眩只让冷却停下',
    ],
    upstreamCases: [
      "sim/feedback5-enemy-swing.test.js::attackWindup: the clip's strike frame, shortened with the clip when the attacks come quicker than it; 0 with no clip",
      'sim/feedback5-enemy-swing.test.js::a blocked enemy swings when its cooldown is over and strikes at the damage frame: the first strike one wind-up after the block (its cooldown long over), then one per attack interval',
      "sim/feedback5-enemy-swing.test.js::a 0.1 s stun before the damage frame cuts the swing: no strike at that frame, the attack starts again from its wind-up after the stun (卡西米尔 6's pulse, 忍冬 S3)",
      "sim/feedback5-enemy-swing.test.js::a 0.2 s stun before the damage frame cuts the swing: no strike at that frame, the attack starts again from its wind-up after the stun (卡西米尔 6's pulse, 忍冬 S3)",
      'sim/feedback5-enemy-swing.test.js::a stun during the cooldown (before the swing) only pauses it; 缴械 cuts a swing like a stun; a strike already made stays made (a ranged shot in flight lands)',
      'sim/feedback5-enemy-swing.test.js::no attack clip known: no wind-up — it strikes as its swing starts, so a stun only pauses its cooldown (the rule before 0.2.0)',
    ],
  },
  {
    id: 'source/unbalance',
    package: 'mission-core',
    rule: '推、拉让敌人失衡：推按受力等级的位移时间，拉按作用时间（受力等级 < −1 减半），保底 0.1 秒；失衡期间不走、不开始普攻、前摇被打断；静态刚体不动也失衡，位移免疫不失衡；浮空、出现结束失衡',
    location:
      '`field/motion/unbalance.ts`（`PUSH_UNBALANCE`、`unbalanceUnit`）、`field/motion/index.ts`（`push`、`pull`）',
    source:
      '参考实现 `server/sim/battle/displacement.js`（`_unbalance`、`_staticForce`）、`server/sim/constants.js`（`PUSH_UNBALANCE`）、`server/sim/ai.js`；PRTS 失衡位移机制、游戏数据基础推力-位移近似对应表、推与拉、特殊机制静态刚体',
    basis: '推拉后敌人短暂停住、普攻被打断',
    verified:
      '已按参考实现核对规则；逐拍边界按核心的拍序定义（施加的这一拍起算，`until` 不含）',
    next: [
      'mission-core/test/field/motion/unbalance.spec.ts::失衡 > 推按受力等级失衡：中力推重量 0（受力等级 1）失衡 0.9 秒，期间不沿路线走，到时接着走',
      'mission-core/test/field/motion/unbalance.spec.ts::失衡 > 推的每一档都按 30 帧的整拍：受力等级 −2 到 3 依次 6、12、24、27、32、35 拍，之后的一拍接着走；位移的画面时长是失衡秒数',
      'mission-core/test/field/motion/unbalance.spec.ts::失衡 > 定向推偏离超过 45° 时按修正后的受力等级取档：中力推重量 1 修正到 −2，失衡 0.2 秒；特效列的推照样按这一档',
      'mission-core/test/field/motion/unbalance.spec.ts::失衡 > 受力等级决定时长：大力推重量 0 是 35 拍，受力等级 −3 不推也不失衡',
      'mission-core/test/field/motion/unbalance.spec.ts::失衡 > 推向墙、第一步就停下时只有失衡硬直的保底 0.1 秒',
      'mission-core/test/field/motion/unbalance.spec.ts::失衡 > 拉在作用时间内失衡：拉不动（已在终点）也失衡 1 秒；受力等级低于 −1 时 0.5 秒',
      'mission-core/test/field/motion/unbalance.spec.ts::失衡 > 静态刚体不动但照样失衡：推按保底，拉按作用时间；受力等级低于 −2 不失衡；位移免疫不失衡',
      'mission-core/test/field/motion/unbalance.spec.ts::失衡 > 更长的失衡保留：失衡中再受一次较短的力不缩短',
      'mission-core/test/field/motion/unbalance.spec.ts::失衡 > 失衡期间不开始普攻、冷却停下，到时才打第一下',
      'mission-core/test/field/motion/unbalance.spec.ts::失衡 > 恐惧也走不出失衡：失衡期间恐惧的位移停下，到时才走',
      'mission-core/test/field/motion/unbalance.spec.ts::失衡 > 前摇中的失衡打断这一下，到时重新走完整个前摇',
      'mission-core/test/field/motion/unbalance.spec.ts::失衡 > 浮空、路线上的出现与内容命令 cutUnbalance 立刻结束失衡；unbalanced 读当前状态',
    ],
  },
  {
    id: 'source/block-targets',
    package: 'mission-core',
    rule: '`blockTargets` 形状的一次攻击打阻挡数个目标，不低于 1，阻挡的敌人在前',
    location: '`combat/target/aim.ts`（`attackTargetIds`）',
    source:
      '参考实现 `server/sim/ai.js` 的 `acquireTargets` / `targetCount`（`hitAllBlocked`）；PRTS 分支特性 强攻手 等"普通攻击最大目标数等于阻挡数（不会低于1）"',
    basis: '强攻手、重剑手、推击手这类分支由数据写 `blockTargets`',
    verified: '已按参考实现的 feedback5-block-targets 用例核对',
    next: [
      'mission-core/test/combat/attack/block-targets.spec.ts::阻挡一个、范围里还有两个：一次攻击打三个，阻挡的那个在前',
      'mission-core/test/combat/attack/block-targets.spec.ts::没阻挡时从范围里取阻挡数个；不超过阻挡数；阻挡数 0 也打一个；不写 blockTargets 只打一个',
    ],
    upstreamCases: [
      'sim/feedback5-block-targets.test.js::blocking one enemy with two more in its range: one attack strikes all three (up to its block count, the blocked one first)',
      'sim/feedback5-block-targets.test.js::blocking none: up to its block count from the range; never more than the block count; never fewer than 1',
    ],
  },
  {
    id: 'source/down-effects',
    package: 'mission-core',
    rule: '友方倒下或撤下时取下身上的效果（各调用一次 onRemove），定义写了 `keepOnDown` 的留着',
    location:
      '`ability/effect/index.ts`（`dropEffectsOnDown`）、`unit/deploy/strategy.ts`、`unit/deploy/command.ts`',
    source:
      '参考实现 `server/sim/battle/deploy.js` 的移除流程（keep persistent buffs only）',
    basis: '特性、天赋这类常驻效果写 `keepOnDown`',
    verified: '已按参考实现的 core 用例核对',
    next: [
      'mission-core/test/ability/effect/down.spec.ts::友方倒下时取下身上的效果并调用 onRemove，keepOnDown 的留着，再部署后还在',
      'mission-core/test/ability/effect/down.spec.ts::撤下同样取下不常驻的效果',
    ],
  },
  {
    id: 'source/extra-range',
    package: 'mission-core',
    rule: '内容加进攻击范围的绝对格子，换位置、换范围之后都留着，直到内容重新设置；不进技能触发的初始范围',
    location: '`combat/target/selector.ts`（`EXTRA_RANGE`、`setExtraRange`）',
    source:
      '参考实现 `server/sim/battle/queries.js` 的 `setExtraRange`、`_refreshRange`',
    basis: '指定目标、额外目标格这类内容能让单位打到范围外的格子',
    verified: '已按参考实现的 engine-requests 用例核对',
    next: [
      'mission-core/test/ability/skill/behavior.spec.ts::setExtraRange 的绝对格子算进攻击范围，换位置后照样在；不让 DEFAULT 触发；null 清掉',
    ],
    upstreamCases: [
      'sim/engine-requests.test.js::setExtraRange: extra tiles join the range across every rebuild (skill, relocate), never the initial range',
    ],
  },
  {
    id: 'source/trigger-area',
    package: 'mission-core',
    rule: '内容登记的技能触发区域（绝对格子或某个单位当前的攻击范围）里有敌人时，非治疗技能每拍按 DEFAULT 释放，攻击者也不等攻击',
    location:
      '`ability/skill/trigger.ts`（`TRIGGER_AREAS`、`areaTriggerMet`）、`ability/skill/point.ts`（`consider`）',
    source:
      '参考实现 `server/sim/skills.js` 的 `addTriggerRange`、`_extraTriggerSatisfied`（TRIGGER_PROFILE：飞行的也算）',
    basis: '召唤物或光束等区域里有敌人就放技能',
    verified: '已按参考实现的 engine-requests 用例核对',
    next: [
      'mission-core/test/ability/skill/behavior.spec.ts::内容的触发区域里有敌人时非治疗技能每拍按 DEFAULT 放：攻击者不等攻击，不攻击的也放；单位区域看它当前的攻击范围；治疗技能不看；撤下后不再算',
    ],
    upstreamCases: [
      'sim/engine-requests.test.js::addTriggerRange: an enemy in a content trigger range fires DEFAULT (attackers and non-attackers), not heal skills; unregister',
    ],
  },
  {
    id: 'source/range-extend-base',
    package: 'mission-core',
    rule: '攻击距离分永久（`rangeExtendBase`）与随技能、限时效果撤下的（`rangeExtend`）两份；普攻范围算两者之和，技能触发（`DEFAULT` 的范围、`ACTIVE_RANGE` 的触发范围、友方触发的范围）只算永久的',
    location: '`combat/target/selector.ts`（`RANGE_EXTEND_BASE`、`baseRange`）',
    source:
      '参考实现 `server/sim/units.js` 的 `baseRangeExtend`（permRangeExtend）、`server/sim/skills.js` 的 `_defaultCondition` 与 `_triggerKeys`',
    basis: '技能延伸的距离不让技能自己提前触发',
    verified: '已按参考实现核对',
    next: [
      'mission-core/test/ability/skill/behavior.spec.ts::技能触发只看永久攻击距离：rangeExtendBase 延伸 DEFAULT 与 ACTIVE_RANGE 的范围，rangeExtend 不延伸；no-range-extend 的技能不加',
    ],
  },
  {
    id: 'source/active-range',
    package: 'mission-core',
    rule: '持续时攻击范围严格大于自身范围的技能，基础策略的条件放到持续时的范围上，每拍都问，不等攻击',
    location: '`ability/skill/trigger.ts`（`activeRange`）',
    source:
      '参考实现 `server/sim/skills.js` 的 ACTIVE_RANGE（项目所有者 2026-10-05 的规则，有意偏离官方）',
    basis: '技能不必等普攻命中，敌人一进持续范围就放',
    verified:
      '已按 feedback5-active-range 用例核对；哪些技能用这条由 app/data 编译',
    next: [
      'mission-core/test/ability/skill/behavior.spec.ts::ACTIVE_RANGE 在持续时的范围上问基础策略：自身范围外、持续范围内有敌人就放，不等攻击；没有敌人不放',
      'mission-core/test/ability/skill/behavior.spec.ts::ACTIVE_RANGE 照基础策略筛敌人：打不中飞行单位时持续范围里的飞行敌人不算，打得中时算',
      'mission-core/test/ability/skill/behavior.spec.ts::ACTIVE_RANGE 的治疗技能看持续范围里的受伤友方，满血的不算',
    ],
    upstreamCases: [
      'sim/feedback5-active-range.test.js::ACTIVE_RANGE: an enemy inside the running range only casts the skill at once (no attack); nobody, or an enemy outside it, does not',
      'sim/feedback5-active-range.test.js::ACTIVE_RANGE: the DEFAULT condition on the larger range — no flyer for a ground-only unit; the permanent 攻击距离 grows it',
      'sim/feedback5-active-range.test.js::ACTIVE_RANGE heal skill: an injured ally inside the running range only casts it; a healthy one does not',
    ],
  },
  {
    id: 'source/blocked-first',
    package: 'mission-core',
    rule: '自己挡着的敌人总是阻挡者的目标，基础策略的技能条件也算它，在不在攻击范围里都一样',
    location: '`ability/skill/trigger.ts`（`holdsEnemy`）',
    source:
      '参考实现 `server/sim/skills.js` `_defaultCondition`；PRTS 卫戍协议/帮助「敌人被近战干员自身阻挡」；用户 playtest #6',
    basis: '远程站近战位也为挡住的敌人放技能',
    verified: '已按 playtest5_blocking 用例核对',
    next: [
      'mission-core/test/ability/skill/behavior.spec.ts::DEFAULT：自己挡着的敌人站在攻击范围外也满足基础策略，出手前放技能',
      'mission-core/test/unit/block/takeover.spec.ts::挡住就打得到 > 单纯的阻挡，四个朝向：阻挡者打它挡住的敌人，不管在不在范围里',
      'mission-core/test/unit/block/takeover.spec.ts::挡住就打得到 > 晚接替（敌人已经穿过前面那位，在它身后、它的范围之外）：接替的阻挡者照样打它',
    ],
    upstreamCases: [
      'sim/playtest5_blocking.test.js::#4 (revised by the user after playtest #6): a ranged operator on a melee tile also hits and casts for the enemy it holds behind it',
    ],
  },
  {
    id: 'source/element-order',
    package: 'mission-core',
    rule: '元素槽给画面的显示值取最满的一槽，一样满时按 `neural`、`erosion`、`burn`、`apoptosis`、`necrosis` 的先后取',
    location:
      '`combat/element/index.ts`（`ELEMENT_ORDER`，内置元素定义的 `order`）；比较在 `combat/element/gauge.ts`（`ELEMENT_GAUGES` 的 view）',
    source:
      '参考实现 `server/sim/constants.js`（`ELEMENT_ORDER`）、`server/sim/damage.js`（`elementView`）',
    basis: '官方元素 id 的先后；画面只显示一个元素图标',
    verified: '已按参考实现核对先后顺序',
    next: [
      'mission-core/test/battle/snapshot.spec.ts::元素视图取最满的一槽，一样满按官方元素先后，爆发时锁住，没有槽时不出现',
      'mission-core/test/battle/snapshot.spec.ts::模块加的元素按定义上的 order 排进内置元素之间，一样满时 order 小的在前',
      'mission-core/test/battle/snapshot.spec.ts::元素没写 order 时排在内置元素之后，order 相同时按 id 的字典序',
    ],
  },
  {
    id: 'source/immunity-names',
    package: 'mission-core',
    rule: '免疫名单用免疫名：冻结是 `frozen`，恐惧和战栗是 `feared`，其余与状态 id 相同',
    location:
      '`contract/spec.ts`（`UnitSpec.immunity`）、`ability/effect/immunity.ts`、`port/definition.ts`（`EffectDefinition.immunity`）',
    source: '参考实现 `server/sim/buffs.js` 状态表的 `immune` 字段',
    basis: '关卡与内容数据沿用这套名字，兼容层不必转换',
    verified: '未核对',
    next: [
      'mission-core/test/ability/effect/catalog.spec.ts::恐惧免疫用 feared',
      'mission-core/test/ability/effect/catalog.spec.ts::第二次寒冷还在身上时施加冻结，单位免疫 frozen 则跳过',
      'mission-core/test/ability/effect/cold.spec.ts::免疫冻结的敌人吃下第二次寒冷，寒冷取更长的时长，不冻结',
    ],
  },
  {
    id: 'source/loadout-compose',
    package: 'mission-core',
    rule: '带模块的属性是无模块属性加模块的平加值并保留六位小数；天赋按序号覆盖，模块未写的键保留，其余追加，空占位丢弃',
    location: '`port/loadout.ts`（`composeStats`、`composeTalents`）',
    source:
      '参考实现 `tools/build-data.mjs`（`mergeTalentChanges`）、`shared/loadoutRecord.js`',
    basis: '与数据构建时的合并规则一致，详情卡与战斗读到同一组数',
    verified: '已按 port/loadout.ts 的用例核对，未逐条对照参考实现',
    next: [
      'mission-core/test/port/loadout.spec.ts::带模块的属性是无模块属性加模块平加值，保留六位小数；没有的字段按 0 加；整数与 1e6 以上不舍入；不改输入',
      'mission-core/test/port/loadout.spec.ts::天赋按序号覆盖，模块未写的键保留、bb 合并，新序号追加，空占位丢弃；不改输入',
    ],
    upstreamCases: [
      'sim/loadout.test.js::getChess(id, loadout): selected skill (bb, SP, trigger) and module (stats, trait, talents); cached; default = same def',
    ],
  },
  {
    id: 'source/loadout-range',
    package: 'mission-core',
    rule: '部署时的攻击范围：技能写明「被动效果：攻击范围扩大」用技能范围；精英且模块写明「攻击范围扩大」用模块范围；否则用记录范围；再加特性的永久攻击距离',
    location: '`port/loadout.ts`（`attackRangeGrid`）',
    source: '参考实现 `shared/loadoutRecord.js`，设计记录 DESIGN §16',
    basis: '官方技能与模块描述的文字约定',
    verified: '已按 port/loadout.ts 的用例核对，未逐条对照参考实现',
    next: [
      'mission-core/test/port/loadout.spec.ts::部署范围：技能写明「被动效果：攻击范围扩大」时用技能范围，先于模块',
      'mission-core/test/port/loadout.spec.ts::部署范围：精英且装着写明「攻击范围扩大」的模块时用模块序号 −1 的范围；不是精英、模块未装或没有该范围时用记录范围',
      'mission-core/test/port/loadout.spec.ts::部署范围再加特性的永久攻击距离，向下取整；集成战略专用、非正数不加；null 与无范围得 null',
    ],
    upstreamCases: [
      "ui/feedback1e-range.test.js::prep: the record's attack range (card without a live entry, board overlay, deploy wheel) = the unit's range at deployment — every loadout",
    ],
  },
  {
    id: 'source/range-extend',
    package: 'mission-core',
    rule: '攻击距离增加 n 时，范围每一行在最远端外补上 1…⌊n⌋ 格（最多补到场地列数 21 格），去重，丢弃无效项',
    location: '`port/loadout.ts`（`extendedGrid`）',
    source:
      '参考实现 `server/sim/targeting.js`（`absoluteRangeKeys`），设计记录 DESIGN §3',
    basis: '官方「攻击距离 +1」按行向前延伸',
    verified: '已按 port/loadout.ts 的用例核对，未逐条对照参考实现',
    next: [
      'mission-core/test/port/loadout.spec.ts::攻击距离 n：每一行在最远端外补 1…⌊n⌋ 格，原格在前；不改输入',
      'mission-core/test/port/loadout.spec.ts::攻击距离：重复格去重，无效项丢弃；n 不大于 0、NaN、Infinity 不延伸；不是数组得空',
      'mission-core/test/port/loadout.spec.ts::攻击距离最多补到场地列数 21 格',
    ],
    upstreamCases: [
      "sim/feedback1e-skillrange.test.js::extendedGrid: the relative form of absoluteRangeKeys' rangeExtend, for every facing (random grids)",
    ],
  },
];
