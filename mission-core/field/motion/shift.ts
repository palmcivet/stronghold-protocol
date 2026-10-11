import { defineComponent, type ComponentStore } from "#kernel/world/component.js"

/** 一段还在走的位移。落点在 landing，路径在 points。 */
export interface ShiftRun {
  readonly id: string
  landingX: number
  landingY: number
  readonly points: { x: number; y: number }[]
  index: number
}

/** 还没走完的推、拉、恐惧或诱导。走完或倒地落位后删掉。 */
export const SHIFT = defineComponent<ShiftRun>("motion:shift", {
  create: () => {
    throw new Error("shift runs are set, not created")
  },
})

export function shiftOf(world: { readonly components: ComponentStore }, unitId: string): ShiftRun | undefined {
  return world.components.access(SHIFT).get(unitId)
}
