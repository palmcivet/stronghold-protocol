import { defineComponent, type ComponentStore } from "#kernel/world/component.js"

/** 阻挡关系。干员记挡住的敌人，敌人记挡住它的干员。快照照常输出这两项。 */
export interface BlockState {
  readonly blocking: string[]
  blockedBy: string | null
}

export const BLOCK = defineComponent<BlockState>("block:hold", { create: () => ({ blocking: [], blockedBy: null }) })

export function blockOf(world: { readonly components: ComponentStore }, unitId: string): BlockState {
  return world.components.access(BLOCK).ensure(unitId)
}

/** 挡住这个单位的干员 id。没被挡时是 null。 */
export function blockerOf(world: { readonly components: ComponentStore }, unitId: string): string | null {
  return world.components.access(BLOCK).get(unitId)?.blockedBy ?? null
}

/** 这个单位正挡着的敌人 id。 */
export function blockingOf(world: { readonly components: ComponentStore }, unitId: string): readonly string[] {
  return world.components.access(BLOCK).get(unitId)?.blocking ?? NONE
}

const NONE: readonly string[] = Object.freeze([])
