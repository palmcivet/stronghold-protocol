import { dataName, useText } from '#infra/text/index.js';
import { cx } from '#infra/theme/class-name.js';
import { Panel } from '#ui/index.js';
import { LoadoutChoices } from './choices.js';
import { useAdjustable } from './roster.js';
import styles from './screen.module.css';
import { SyncStatus, TakesEffect } from './sync-status.js';

/** Skill, module, potential and cultivation of each operator, in one list; only what differs from the default is sent. */
export function LoadoutPanel() {
  const t = useText();
  const operators = useAdjustable();
  return (
    <Panel title={t('core:loadout.heading')}>
      <ul className={cx(styles.list)}>
        {operators.map((chess) => (
          <li key={chess.id} className={cx(styles.item)}>
            <span>{dataName('chess', chess.id)}</span>
            <LoadoutChoices chess={chess} />
          </li>
        ))}
      </ul>
      <div className={cx(styles.row)}>
        <SyncStatus kind="loadout" />
        <TakesEffect kind="loadout" />
      </div>
    </Panel>
  );
}
