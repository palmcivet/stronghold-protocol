import { cx } from '@alliance/ui';
import { useText } from '#infra/text/index.js';
import { DIALOG } from '#part/dialog.js';
import { definePart, Part } from '#part/registry.js';
import { insertPart } from '#part/slot.js';
import { PartTabs } from '#part/tabs.js';
import { LoadoutDetail, LoadoutRoster } from './roster.js';
import styles from './screen.module.css';
import { CustomSquad, Ownership } from './squad.js';

export const LOADOUT = {
  tabs: 'core:loadout.tabs',
  roster: 'core:loadout.roster',
  detail: 'core:loadout.detail',
  ownership: 'core:loadout.ownership',
  diy: 'core:loadout.diy',
} as const;

/** The loadout dialog: the loadout, ownership and custom squad tabs. */
function LoadoutLayout() {
  const t = useText();
  return (
    <section data-part={DIALOG.loadout} className={cx(styles.dialog)}>
      <PartTabs id={LOADOUT.tabs} label={t('core:loadout.heading')} />
    </section>
  );
}

/** The roster tab: the list beside the selected operator's detail part. */
function RosterTab() {
  return (
    <div className={cx(styles.rosterTab)}>
      <div className={cx(styles.pane)}>
        <LoadoutRoster />
      </div>
      <div className={cx(styles.pane)}>
        <Part id={LOADOUT.detail} />
      </div>
    </div>
  );
}

export function registerLoadoutPage(): readonly (() => void)[] {
  return [
    definePart(DIALOG.loadout, LoadoutLayout, { extensible: true }),
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
