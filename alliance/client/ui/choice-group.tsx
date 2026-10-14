import {
  Label,
  Radio,
  RadioGroup,
  type RadioGroupProps,
} from 'react-aria-components';
import { cx } from '#infra/theme/class-name.js';
import styles from './primitive.module.css';

export interface ChoiceOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export interface ChoiceGroupProps
  extends Omit<RadioGroupProps, 'className' | 'children'> {
  readonly label: string;
  readonly options: readonly ChoiceOption[];
}

/** One choice out of a few, as radio buttons. */
export function ChoiceGroup({ label, options, ...rest }: ChoiceGroupProps) {
  return (
    <RadioGroup {...rest} className={cx(styles.field)} orientation="horizontal">
      <Label className={cx(styles.label)}>{label}</Label>
      <div className={cx(styles.group)}>
        {options.map((option) => (
          <Radio
            key={option.value}
            value={option.value}
            isDisabled={option.disabled ?? false}
            className={cx(styles.radio)}
          >
            {option.label}
          </Radio>
        ))}
      </div>
    </RadioGroup>
  );
}
