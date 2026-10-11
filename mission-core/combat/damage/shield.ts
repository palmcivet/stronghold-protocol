import { defineComponent, type ComponentStore } from "#kernel/world/component.js"

/** 溢出治疗转成的护盾，上限是最大生命。 */
export interface OverhealState {
  amount: number
}

export const OVERHEAL_SHIELD = defineComponent<OverhealState>("damage:overheal-shield", { create: () => ({ amount: 0 }) })

/** 溢出护盾的数额。没有记录时是 0。 */
export function overhealOf(world: { readonly components: ComponentStore }, unitId: string): number {
  return world.components.access(OVERHEAL_SHIELD).get(unitId)?.amount ?? 0
}

export function setOverheal(world: { readonly components: ComponentStore }, unitId: string, amount: number): void {
  world.components.access(OVERHEAL_SHIELD).ensure(unitId).amount = amount
}
