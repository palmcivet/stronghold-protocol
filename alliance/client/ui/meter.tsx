import { Meter as AriaMeter, Label } from 'react-aria-components';
import { cx } from '#infra/theme/class-name.js';
import styles from './primitive.module.css';

export interface MeterProps {
  readonly label: string;
  readonly value: number;
  readonly max: number;
  /** Text read out and shown beside the label. Defaults to `value/max`. */
  readonly valueLabel?: string;
}

export function Meter({ label, value, max, valueLabel }: MeterProps) {
  const shown = valueLabel ?? `${value}/${max}`;
  return (
    <AriaMeter
      value={value}
      minValue={0}
      maxValue={Math.max(1, max)}
      valueLabel={shown}
      className={cx(styles.meter)}
    >
      {({ percentage }) => (
        <>
          <Label>{label}</Label>
          <span>{shown}</span>
          <div className={cx(styles.track)}>
            <div
              className={cx(styles.fill)}
              style={{ width: `${percentage}%` }}
            />
          </div>
        </>
      )}
    </AriaMeter>
  );
}
