import { defineTag, type MissionModule, type TagKey } from 'arknights-mission-core';

/**
 * Season enemy catalog tags (race / material flavor). Master puts them on unit specs; mission-core only ships
 * combat tags (boss, elite, stun, …). Registering these as inert tags lets `createBattle` accept the catalog.
 */
const CATALOG_FLAVOR_TAGS = [
  'animated',
  'sarkaz',
  'origen',
  'machine',
  'drone',
  'seamonster',
  'infection',
  'originiumartscraft',
  'mutant',
  'collapsal',
] as const;

const KEYS: readonly TagKey[] = CATALOG_FLAVOR_TAGS.map((id) =>
  defineTag(id, { meaning: `catalog flavor: ${id}` }),
);

/** Registers catalog flavor tags so upstream enemy specs can enter a local battle. */
export const catalogFlavorTagModule: MissionModule = {
  id: 'catalog-flavor-tags',
  install(ctx) {
    for (const key of KEYS) {
      ctx.registerTag(key);
    }
  },
};
