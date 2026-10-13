import { useMatch } from '../../infra/store/hook.js';
import { useText } from '../../infra/text/index.js';
import { cx } from '../../infra/theme/class-name.js';
import { Panel } from '../../ui/index.js';
import styles from './panel.module.css';

export function Ticker() {
  const t = useText();
  const lines = useMatch((state) => state.ticker);
  return (
    <Panel title={t('core:ticker.heading')} level={3}>
      <ol role="log" aria-live="polite" className={cx(styles.ticker)}>
        {lines.map((line) => (
          <li key={line.id}>{line.text}</li>
        ))}
      </ol>
    </Panel>
  );
}
