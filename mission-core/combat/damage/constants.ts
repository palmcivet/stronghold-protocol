/** 减伤后至少保留原伤害的这个比例。 */
export const MIN_DAMAGE_RATIO = 0.05

/** 首领限伤。单次结算达到这个值就整段取消。 */
export const BOSS_HIT_LIMIT = 300000

/** 干员和普通敌人的元素槽上限。 */
export const ELEMENT_GAUGE_MAX = 1000

/** 敌人首领的元素槽上限。调用方写进单位属性 gaugeMax。 */
export const ELEMENT_GAUGE_MAX_LEADER = 2000

/**
 * 五种元素的爆发。
 * ally 是打在干员侧的数字，enemy 是打在敌人侧的数字。
 */
export const ELEMENT = {
  burn: {
    ally: { damage: 1200, type: "arts", resDown: 20, duration: 10 },
    enemy: { elemDamage: 7000, resDown: 20, duration: 10 },
  },
  neural: {
    ally: { damage: 1000, type: "true", stun: 10, duration: 10 },
    enemy: { elemDamage: 6000, palsy: 3, duration: 10 },
  },
  apoptosis: {
    ally: { dps: 100, dpsType: "arts", spLossPerSec: 1, duration: 15 },
    enemy: { elemDps: 800, weaken: 0.5, duration: 15 },
  },
  erosion: {
    ally: { damage: 800, type: "phys", defDown: 100, duration: 10 },
    enemy: { elemDamage: 5000, defDown: 120, duration: 8 },
  },
  necrosis: { dps: 100, duration: 12, atkDownPct: 0.2 },
} as const
