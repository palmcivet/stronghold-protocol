import { TICK as STEP } from "arknights-mission-core"
import { GEO, SKILL_SUMMON_START_DEPLOY as SUMMON_ON_DEPLOY } from "@alliance/contract/match.js"

export { GEO }

export const TICK: number = STEP
export const ROWS: number = GEO.ROWS
export const COLS: number = GEO.COLS
export const MOVE_SCALE: number = 0.5
export const ATTACK_PAUSE: number = 0.35
export const ALLY_COLLIDER_RADIUS: number = 0.25
export const ELEMENT_GAUGE_MAX: number = 1000
export const ELEMENT_GAUGE_MAX_LEADER: number = 2000
export const DIRECT_BONUS_STACKING: "add" = "add"
export const CHAIN_RADIUS: number = 1.7
export const PUSH_DIRECTIONAL_MIN_DIST: number = 0.25
export const PULL_STOP_RADIUS: number = 0.6708
export const PULL_WEAK_SHARE: number = 0.35
export const PULL_CRAWL: number = 0.03
export const PULL_ORIGIN: number = 0.5
export const FORCED_EXIT: string = "forcedExit"
export const ASPD_MIN: number = 20
export const ASPD_MAX: number = 600
export const MIN_DAMAGE_RATIO: number = 0.05
export const SKILL_SUMMON_START_DEPLOY: boolean = SUMMON_ON_DEPLOY

export const BOOMERANG_RETURN_SPEED: number = 3.75

export const PROJECTILE_SPEEDS: Readonly<Record<string, number>> = Object.freeze({
  arrow: 14, bolt: 11, bomb: 8, lob: 8, orb: 10, drone: 16, enemy: 10, boomerang: 15, droneBomb: 5,
})

export const PUSH_EFFECT_SKILLS: ReadonlySet<string> = Object.freeze(new Set(["skchr_forcer_1", "skchr_forcer_2"]))

export const ELEMENT: Readonly<Record<string, Readonly<Record<string, unknown>>>> = Object.freeze({
  burn: Object.freeze({
    burstDamage: 1200, burstType: "arts", resDown: 20, duration: 10,
    ally: Object.freeze({ damage: 1200, type: "arts", resDown: 20, duration: 10 }),
    enemy: Object.freeze({ elemDamage: 7000, resDown: 20, duration: 10 }),
  }),
  neural: Object.freeze({
    burstDamage: 1000, burstType: "true", stun: 10, duration: 10,
    ally: Object.freeze({ damage: 1000, type: "true", stun: 10, duration: 10 }),
    enemy: Object.freeze({ elemDamage: 6000, palsy: 3, duration: 10 }),
  }),
  apoptosis: Object.freeze({
    dps: 100, duration: 15,
    ally: Object.freeze({ dps: 100, dpsType: "arts", spLossPerSec: 1, duration: 15 }),
    enemy: Object.freeze({ elemDps: 800, weaken: 0.5, duration: 15 }),
  }),
  erosion: Object.freeze({
    ally: Object.freeze({ damage: 800, type: "phys", defDown: 100, duration: 10 }),
    enemy: Object.freeze({ elemDamage: 5000, defDown: 120, duration: 8 }),
  }),
  necrosis: Object.freeze({ dps: 100, duration: 12, atkDownPct: 0.2 }),
})
