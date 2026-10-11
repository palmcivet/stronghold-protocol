import { defineComponent, type ComponentStore } from "#kernel/world/component.js"

/** 首领限伤。带这个组件的单位单次受到达到限伤的伤害时不扣生命。 */
export const HIT_LIMIT = defineComponent<true>("damage:hit-limit", { create: () => true })

export function hasHitLimit(world: { readonly components: ComponentStore }, unitId: string): boolean {
  return world.components.access(HIT_LIMIT).get(unitId) === true
}
