import { defineComponent, type ComponentStore } from "#kernel/world/component.js"

/** 已经飞出、还没回到投掷者手上的回旋物。 */
export interface BoomerangState {
  out: number
}

/** 回旋物计数。快照的 components 视图里给出 out。 */
export const BOOMERANG = defineComponent<BoomerangState>("attack:boomerang", {
  create: () => ({ out: 0 }),
  view: (value) => ({ out: value.out }),
})

/** 飞出未回的回旋物数量。没有记录时是 0。 */
export function boomerangCount(world: { readonly components: ComponentStore }, unitId: string): number {
  return world.components.access(BOOMERANG).get(unitId)?.out ?? 0
}

export function boomerangOf(world: { readonly components: ComponentStore }, unitId: string): BoomerangState {
  return world.components.access(BOOMERANG).ensure(unitId)
}
