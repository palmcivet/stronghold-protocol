import { defineTag, type TagKey } from "#kernel/world/tag.js"

// MARK: action

/** 不能普攻、不能放技能。 */
export const CANNOT_ACT: TagKey = defineTag("cannot-act", { meaning: "cannot attack or cast skills" })

/** 状态持续期间不能普攻。 */
export const CANNOT_ATTACK: TagKey = defineTag("cannot-attack", { meaning: "temporarily cannot make normal attacks" })

/** 不能放技能。 */
export const CANNOT_CAST: TagKey = defineTag("cannot-cast", { meaning: "cannot cast skills" })

/** 不能自主移动。 */
export const NO_MOVE: TagKey = defineTag("no-move", { meaning: "does not move on its own" })

/** 眩晕：不能行动。眩晕的干员放开所挡的敌人，由眩晕状态另授 NO_BLOCK。 */
export const STUN: TagKey = defineTag("stun", { meaning: "stunned", implies: [CANNOT_ACT] })

export const FREEZE: TagKey = defineTag("freeze", { meaning: "frozen" })

export const COLD: TagKey = defineTag("cold", { meaning: "chilled; a second chill freezes" })

export const SILENCE: TagKey = defineTag("silence", { meaning: "silenced", implies: [CANNOT_CAST] })

export const DISARM: TagKey = defineTag("disarm", { meaning: "disarmed", implies: [CANNOT_ATTACK] })

export const BIND: TagKey = defineTag("bind", { meaning: "bound in place" })

export const FEAR: TagKey = defineTag("fear", { meaning: "feared; runs away from the source" })

export const ATTRACT: TagKey = defineTag("attract", { meaning: "drawn toward a point" })

/** 战栗：被阻挡时停止普攻。 */
export const TREMBLE: TagKey = defineTag("tremble", { meaning: "stops attacking while blocked" })

/** 单位本身不普攻，技能按范围就绪释放。 */
export const NO_ATTACK: TagKey = defineTag("no-attack", { meaning: "never makes normal attacks" })

// MARK: block

/** 不阻挡。 */
export const NO_BLOCK: TagKey = defineTag("no-block", { meaning: "does not block" })

export const UNBLOCKABLE: TagKey = defineTag("unblockable", { meaning: "cannot be blocked" })

/** 能挡住飞行单位。 */
export const BLOCK_FLY: TagKey = defineTag("block-fly", { meaning: "blocks flying units" })

/** 装置。阻挡接触用装置半径，不看飞行半径。 */
export const DEVICE: TagKey = defineTag("device", { meaning: "device; uses the device contact radius" })

// MARK: target

/** 不被选择器与普攻选中。 */
export const UNTARGETABLE: TagKey = defineTag("untargetable", { meaning: "not chosen by selectors or attacks" })

/** 不受伤害。 */
export const INVULNERABLE: TagKey = defineTag("invulnerable", { meaning: "takes no damage" })

/**
 * 沉睡：不能行动、不阻挡、不被阻挡。
 * 不被范围效果与普攻选中、挡下伤害由选择器、命中与伤害各自查 SLEEP 判断：治疗照常选中沉睡的友方，
 * 忽略沉睡的伤害与带 HIT_SLEEP 的攻击者照常命中。
 */
export const SLEEP: TagKey = defineTag("sleep", {
  meaning: "asleep",
  implies: [CANNOT_ACT, NO_BLOCK, UNBLOCKABLE],
})

/** 隐匿：未破隐时不被普攻与范围效果选中。 */
export const STEALTH: TagKey = defineTag("stealth", { meaning: "stealthed" })

/** 显形：隐匿不再生效。 */
export const REVEAL: TagKey = defineTag("reveal", { meaning: "revealed; stealth has no effect" })

/** 解除阻挡后的破隐期：隐匿不再生效。 */
export const STEALTH_OFF: TagKey = defineTag("stealth-off", { meaning: "stealth is suspended" })

/** 迷彩：不被敌方普通攻击选中，正在挡它的单位除外。范围效果不看迷彩。 */
export const CAMOU: TagKey = defineTag("camou", { meaning: "camouflaged against enemy normal attacks" })

/** 起飞：敌方地面单位不能选中、不能命中。 */
export const LIFTOFF: TagKey = defineTag("liftoff", { meaning: "out of reach of enemy ground units" })

/** 孤立：自身没有攻击目标时不被友方选择器选中。 */
export const ISOLATED: TagKey = defineTag("isolated", { meaning: "not chosen by allied selectors" })

/** 普攻能打飞行单位。属性 canHitFly 大于 0 也算。 */
export const CAN_HIT_FLY: TagKey = defineTag("can-hit-fly", { meaning: "normal attacks reach flying units" })

// MARK: body

/** 视为空中。敌人带着它算空中单位。 */
export const AIRBORNE: TagKey = defineTag("airborne", { meaning: "counts as airborne" })

/** 浮空。 */
export const LEVITATE: TagKey = defineTag("levitate", { meaning: "levitated", implies: [AIRBORNE] })

/** 近地悬浮。 */
export const FLOAT: TagKey = defineTag("float", { meaning: "hovering", implies: [AIRBORNE] })

/** 位移免疫。 */
export const NO_DISPLACE: TagKey = defineTag("no-displace", { meaning: "immune to forced movement" })

/** 静态刚体：不被位移。 */
export const STATIC_BODY: TagKey = defineTag("static-body", { meaning: "static body; never displaced" })

/** 不在场上可见。快照给路线消失的单位写上它。 */
export const HIDDEN: TagKey = defineTag("hidden", { meaning: "not visible on the field" })

// MARK: damage

/** 每下受击记 1 点，跳过减伤与乘区。 */
export const HIT_COUNT: TagKey = defineTag("hit-count", { meaning: "each hit deals exactly one point" })

/** 只按次数计法术伤害，物理照常结算。 */
export const HIT_COUNT_ARTS: TagKey = defineTag("hit-count-arts", { meaning: "each arts hit deals exactly one point" })

/** 攻击者能打到沉睡的目标。 */
export const HIT_SLEEP: TagKey = defineTag("hit-sleep", { meaning: "hits sleeping targets" })

/** 不接受治疗。生命回复与指明忽略的治疗除外。 */
export const HEAL_FREE: TagKey = defineTag("heal-free", { meaning: "refuses healing" })

/** 禁疗。治疗来自自己时不拦。 */
export const NO_HEAL: TagKey = defineTag("no-heal", { meaning: "cannot be healed by others" })

/** 元素损伤不累积、不爆发。撤销时清空元素槽。 */
export const BURST_LOCK: TagKey = defineTag("burst-lock", { meaning: "element damage neither builds up nor bursts" })

/** 阻回：技力不自然回复，也不接受外界给予。 */
export const NO_SP: TagKey = defineTag("no-sp", { meaning: "skill points do not recover" })

// MARK: deploy

/** 召唤物。开战排在干员后面。 */
export const TOKEN: TagKey = defineTag("token", { meaning: "summoned token; deployed after operators" })

/** 开战不上场，初始格子留给它。 */
export const DEFER_DEPLOY: TagKey = defineTag("defer-deploy", { meaning: "stays off the field at the opening" })

/** 引擎认识的全部标签。每场战斗开始时注册。 */
export const CORE_TAGS: readonly TagKey[] = [
  CANNOT_ACT,
  CANNOT_ATTACK,
  CANNOT_CAST,
  NO_MOVE,
  STUN,
  FREEZE,
  COLD,
  SILENCE,
  DISARM,
  BIND,
  FEAR,
  ATTRACT,
  TREMBLE,
  NO_ATTACK,
  NO_BLOCK,
  UNBLOCKABLE,
  BLOCK_FLY,
  DEVICE,
  UNTARGETABLE,
  INVULNERABLE,
  SLEEP,
  STEALTH,
  REVEAL,
  STEALTH_OFF,
  CAMOU,
  LIFTOFF,
  ISOLATED,
  CAN_HIT_FLY,
  AIRBORNE,
  LEVITATE,
  FLOAT,
  NO_DISPLACE,
  STATIC_BODY,
  HIDDEN,
  HIT_COUNT,
  HIT_COUNT_ARTS,
  HIT_SLEEP,
  HEAL_FREE,
  NO_HEAL,
  BURST_LOCK,
  NO_SP,
  TOKEN,
  DEFER_DEPLOY,
]
