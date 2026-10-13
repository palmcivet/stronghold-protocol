import { PAGE } from '../infra/router/page.js';
import { useText } from '../infra/text/index.js';
import { BackButton } from '../part/back.js';
import { definePart, Part } from '../part/registry.js';
import { insertPart } from '../part/slot.js';
import { PartTabs } from '../part/tabs.js';
import { Columns, Screen } from '../ui/index.js';
import { LoadoutDetail, LoadoutRoster } from './roster.js';
import { CustomSquad, Ownership } from './squad.js';

export const LOADOUT = {
  tabs: 'core:loadout.tabs',
  roster: 'core:loadout.roster',
  detail: 'core:loadout.detail',
  ownership: 'core:loadout.ownership',
  diy: 'core:loadout.diy',
} as const;

/** The loadout page: the loadout, ownership and custom squad tabs. Local; it returns where the player came from. */
function LoadoutLayout() {
  const t = useText();
  return (
    <section data-part={PAGE.loadout}>
      <Screen title={t('core:loadout.heading')} tools={<BackButton />}>
        <PartTabs id={LOADOUT.tabs} label={t('core:loadout.heading')} />
      </Screen>
    </section>
  );
}

/** The roster tab: the list beside the selected operator's detail part. */
function RosterTab() {
  return (
    <Columns min={20} gap={4}>
      <LoadoutRoster />
      <Part id={LOADOUT.detail} />
    </Columns>
  );
}

export function registerLoadoutPage(): readonly (() => void)[] {
  return [
    definePart(PAGE.loadout, LoadoutLayout, { extensible: true }),
    definePart(LOADOUT.roster, RosterTab, {
      extensible: true,
      title: 'core:loadout.tab.roster',
    }),
    definePart(LOADOUT.detail, LoadoutDetail, {
      extensible: true,
    }),
    definePart(LOADOUT.ownership, Ownership, {
      extensible: true,
      title: 'core:loadout.tab.ownership',
    }),
    definePart(LOADOUT.diy, CustomSquad, {
      extensible: true,
      title: 'core:loadout.tab.diy',
    }),
    insertPart({ into: LOADOUT.tabs, id: LOADOUT.roster, order: 10 }),
    insertPart({ into: LOADOUT.tabs, id: LOADOUT.ownership, order: 20 }),
    insertPart({ into: LOADOUT.tabs, id: LOADOUT.diy, order: 30 }),
  ];
}
