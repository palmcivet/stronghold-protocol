import { useMatch } from '../../infra/store/hook.js';
import { dataName, useText } from '../../infra/text/index.js';
import { cx } from '../../infra/theme/class-name.js';
import { Panel } from '../../ui/index.js';
import styles from './panel.module.css';

/** Shared by every render without a private view, so the selection stays equal. */
const NONE: readonly never[] = [];

/** The next wave and the effects in force. */
export function Intel() {
  const t = useText();
  const { enemies, effects } = useMatch((state) => ({
    enemies: state.private?.nextEnemies ?? NONE,
    effects: state.private?.effects ?? NONE,
  }));
  return (
    <>
      {enemies.length ? (
        <Panel title={t('core:match.nextEnemies')} level={3}>
          <ul className={cx(styles.list)}>
            {enemies.map((enemy, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a preview line is its index
              <li key={index} className={cx(styles.line)}>
                <span>{dataName('enemy', enemy.enemyKey)}</span>
                <span>×{enemy.count}</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
      {effects.length ? (
        <Panel title={t('core:match.effects')} level={3}>
          <ul className={cx(styles.list)}>
            {effects.map((effect) => (
              <li key={effect.id}>{effect.desc ?? effect.name ?? effect.id}</li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </>
  );
}
