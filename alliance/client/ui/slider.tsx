import {
  Slider as AriaSlider,
  Label,
  SliderOutput,
  SliderThumb,
  SliderTrack,
} from 'react-aria-components';
import { cx } from '../infra/theme/class-name.js';
import styles from './primitive.module.css';

export interface SliderProps {
  readonly label: string;
  readonly value: number;
  readonly onChange: (value: number) => void;
  readonly minValue?: number;
  readonly maxValue?: number;
  readonly step?: number;
  readonly isDisabled?: boolean;
}

/** A labelled value on a track, with its number shown. */
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
    >
      <Label>{label}</Label>
      <SliderOutput />
      <SliderTrack className={cx(styles.track)}>
        {({ state }) => (
          <>
            <div
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
