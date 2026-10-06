/** 寒冷的攻击速度变化。 */
export const COLD_ASPD = -30

/** 敌人被冻结时法术抗性下降的点数。 */
export const FREEZE_RES_DOWN = 15

/** 两边寒冷都没有时长时，冻结使用的秒数。 */
export const COLD_FREEZE_DURATION = 3

/** 重量超过这个值时，浮空持续时间减半。 */
export const LEVITATE_HALF_WEIGHT = 3

/** 抵抗默认减掉的持续时间比例，最高按 0.95 计。 */
export const RESIST_DEFAULT = 0.5

export const RESIST_CAP = 0.95

/** 抵抗让麻痹每这么多秒掉 1 层。 */
export const RESIST_PALSY_DECAY = 5

/** 麻痹层数上限。每一层取消敌人的下一次普攻。 */
export const PALSY_MAX = 3

/** 抵抗会缩短这些状态的持续时间。麻痹改为掉层。 */
export const RESISTED: ReadonlySet<string> = new Set([
  "stun",
  "freeze",
  "cold",
  "sleep",
  "fear",
  "tremble",
  "attract",
  "levitate",
  "bind",
  "silence",
  "disarm",
  "sluggish",
  "slow",
])
