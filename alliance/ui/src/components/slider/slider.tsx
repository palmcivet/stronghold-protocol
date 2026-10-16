import {
  Slider as AriaSlider,
  Label,
  SliderOutput,
  SliderThumb,
  SliderTrack,
} from 'react-aria-components';
import { cx } from '#ui/base/class-name.js';
import styles from './slider.module.css';

export interface SliderProps {
  readonly label: string;
  readonly value: number;
  readonly onChange: (value: number) => void;
  readonly minValue?: number;
  readonly maxValue?: number;
  readonly step?: number;
  readonly isDisabled?: boolean;
}

/** A labelled value on a track with a hexagonal thumb, and its number shown. */
export function Slider({
  label,
  value,
  onChange,
  minValue = 0,
  maxValue = 100,
  step = 1,
  isDisabled = false,
}: SliderProps) {
  return (
    <AriaSlider
      value={value}
      onChange={onChange}
      minValue={minValue}
      maxValue={maxValue}
      step={step}
      isDisabled={isDisabled}
      className={cx(styles.slider)}
      data-tone="accent"
    >
      <Label className={cx(styles.label)}>{label}</Label>
      <SliderOutput className={cx(styles.output)} />
      <SliderTrack className={cx(styles.track)}>
        {({ state }) => (
          <>
            <span className={cx(styles.rail)} />
            <span
              className={cx(styles.fill)}
              style={{ width: `${state.getThumbPercent(0) * 100}%` }}
            />
            <SliderThumb className={cx(styles.thumb)} />
          </>
        )}
      </SliderTrack>
    </AriaSlider>
  );
}
