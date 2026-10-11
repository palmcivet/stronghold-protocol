import {
  type ComponentStore,
  defineComponent,
} from '#kernel/world/component.js';

export interface ElementSlot {
  value: number;
  /** 蓄满之后锁住，爆发冷却结束时清零解锁。 */
  locked: boolean;
  /** 蓄满的数值。 */
  cap: number;
  /** 元素定义上的 order，没写时是 null，排在写了的后面。显示值一样满时取小的，再相同按 id。 */
  order: number | null;
}

/** 单位的元素槽、爆发结算中的开关与爆发击杀的记账人。 */
export interface ElementGauges {
  readonly slots: Map<string, ElementSlot>;
  /** 正在结算的元素爆发。这段时间任何元素都不进槽。 */
  bursting: boolean;
  /** 最近一次把元素槽打满的单位。爆发伤害的击杀记在它身上。 */
  credit: string;
}

/** 头顶条显示的元素槽：最满的一种，爆发冷却中是锁住的那种。 */
export interface ElementGaugeView {
  readonly element: string;
  /** 槽的比例，0 到 1。 */
  readonly ratio: number;
  readonly locked: boolean;
}

export const ELEMENT_GAUGES = defineComponent<ElementGauges>('element:gauges', {
  create: () => ({ slots: new Map(), bursting: false, credit: '' }),
  view: viewGauges,
  codec: {
    encode: (gauges) => ({
      slots: [...gauges.slots.entries()],
      bursting: gauges.bursting,
      credit: gauges.credit,
    }),
    decode(data) {
      const saved = data as {
        slots: readonly (readonly [string, ElementSlot])[];
        bursting: boolean;
        credit: string;
      };
      return {
        slots: new Map(saved.slots),
        bursting: saved.bursting,
        credit: saved.credit,
      };
    },
  },
});

export function gaugesOf(
  world: { readonly components: ComponentStore },
  unitId: string,
): ElementGauges {
  return world.components.access(ELEMENT_GAUGES).ensure(unitId);
}

/** 没有记录时返回 undefined，不新建。 */
export function peekGauges(
  world: { readonly components: ComponentStore },
  unitId: string,
): ElementGauges | undefined {
  return world.components.access(ELEMENT_GAUGES).get(unitId);
}

function viewGauges(gauges: ElementGauges): ElementGaugeView | null {
  let best: ElementGaugeView | null = null;
  let bestRank = Infinity;
  for (const [element, slot] of gauges.slots) {
    if (slot.locked) {
      return { element, ratio: 1, locked: true };
    }
    if (!(slot.value > 0) || !(slot.cap > 0)) {
      continue;
    }
    const ratio = slot.value / slot.cap;
    const rank = slot.order ?? Infinity;
    if (
      best === null ||
      ratio > best.ratio ||
      (ratio === best.ratio && ahead(rank, element, bestRank, best.element))
    ) {
      best = { element, ratio, locked: false };
      bestRank = rank;
    }
  }
  return best;
}

function ahead(
  order: number,
  element: string,
  bestOrder: number,
  bestElement: string,
): boolean {
  if (order !== bestOrder) {
    return order < bestOrder;
  }
  return element < bestElement;
}
