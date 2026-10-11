import { defineComponent, type ComponentStore } from "#kernel/world/component.js"

/** 索敌时优先比较的排序键 id。空串表示不额外排序。 */
export const TARGET_PRIORITY = defineComponent<string>("target:priority", { create: () => "" })

export function targetPriorityOf(world: { readonly components: ComponentStore }, unitId: string): string {
  return world.components.access(TARGET_PRIORITY).get(unitId) ?? ""
}

export function setTargetPriority(world: { readonly components: ComponentStore }, unitId: string, priority: string): void {
  world.components.access(TARGET_PRIORITY).set(unitId, priority)
}
