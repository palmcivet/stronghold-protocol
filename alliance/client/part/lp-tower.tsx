import { cx } from '@alliance/ui';
import styles from './lp-tower.module.css';

/** Life points as a column that fills toward `max`, with the figure beside it. */
export function LpTower({
  lp,
  max,
  label,
}: {
  readonly lp: number;
  readonly max: number;
  readonly label: string;
}) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, lp / max)) : 0;
  return (
    <span
      role="img"
      aria-label={label}
      className={cx(styles.lp)}
      data-low={ratio <= 0.25 || undefined}
    >
      <span className={cx(styles.lpBar)}>
        <span
          className={cx(styles.lpFill)}
          style={{ height: `${ratio * 100}%` }}
        />
      </span>
      <span aria-hidden="true" className={cx(styles.lpValue)}>
        {lp}
      </span>
    </span>
  );
}
