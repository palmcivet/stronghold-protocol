import { defineComponent, type ComponentStore } from "#kernel/world/component.js"

/** 规格写的免疫名单。冻结写成 frozen，恐惧和战栗写成 feared，其余与状态 id 相同。 */
// TRACE: source/immunity-names
export const IMMUNITY = defineComponent<ReadonlySet<string>>("effect:immunity", {
  create: () => NONE,
  codec: {
    encode: (names) => [...names],
    decode: (data) => new Set(data as readonly string[]),
  },
})

const NONE: ReadonlySet<string> = new Set()

export function immunityOf(world: { readonly components: ComponentStore }, unitId: string): ReadonlySet<string> {
  return world.components.access(IMMUNITY).get(unitId) ?? NONE
}
