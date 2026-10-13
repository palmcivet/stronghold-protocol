import { useMatch } from '../../infra/store/hook.js';
import { dataName, useText } from '../../infra/text/index.js';
import { cx } from '../../infra/theme/class-name.js';
import { Panel } from '../../ui/index.js';
import styles from './panel.module.css';

export function Bonds() {
  const t = useText();
  const bonds = useMatch((state) => state.private?.bonds ?? null);
  if (!bonds?.length) {
    return null;
  }
  return (
    <Panel title={t('core:bonds.heading')} level={3}>
      <ul className={cx(styles.list)}>
        {bonds.map((bond) => {
          const next =
            bond.thresholds?.find((threshold) => threshold > bond.count) ??
            bond.thresholds?.at(-1) ??
            bond.count;
          return (
            <li
              key={bond.bondId}
              className={cx(
                bond.off ? styles.off : bond.active && styles.active,
              )}
            >
              {t('core:bonds.entry', {
                name: dataName('bond', bond.bondId),
                count: bond.count,
                next,
              })}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
