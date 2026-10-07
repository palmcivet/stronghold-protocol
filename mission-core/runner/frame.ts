import type { BattleEvent } from "#contract/event.js"
import type { Battle } from "#battle/create-battle.js"
import { TICK } from "#tick/index.js"

/** 一帧里最多补这么多拍，剩下的时间留到下一帧。 */
export const FRAME_CATCHUP = 150

export interface FrameClock {
  /** 按速度把这一帧的秒数换成拍，每拍的事件单独成一组。 */
  advance(battle: Battle, frameSeconds: number, speed?: number): readonly (readonly BattleEvent[])[]
}

export function createFrameClock(): FrameClock {
  let bank = 0
  return {
    advance(battle, frameSeconds, speed = 1) {
      const rate = Number.isFinite(speed) && speed > 0 ? speed : 0
      const span = Number.isFinite(frameSeconds) && frameSeconds > 0 ? frameSeconds : 0
      bank += span * rate
      const groups: BattleEvent[][] = []
      let caught = 0
      while (bank + 1e-12 >= TICK && caught < FRAME_CATCHUP) {
        bank -= TICK
        caught += 1
        battle.step()
        groups.push(battle.drainEvents().slice())
      }
      return groups
    },
  }
}
