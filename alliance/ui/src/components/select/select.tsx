import {
  Button as AriaButton,
  ListBox as AriaListBox,
  Popover as AriaPopover,
  Select as AriaSelect,
  Label,
  ListBoxItem,
  SelectValue,
} from 'react-aria-components';
import { cx } from '#ui/base/class-name.js';
import { Icon } from '#ui/components/icon/icon.js';
import styles from './select.module.css';

/** One choice from a dropdown. */
export function Select({
  label,
  options,
  value,
  onChange,
  isDisabled,
}: {
  readonly label: string;
  readonly options: readonly {
    readonly value: string;
    readonly label: string;
  }[];
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly isDisabled?: boolean;
}) {
  return (
    <AriaSelect
      selectedKey={value}
      onSelectionChange={(key) => key !== null && onChange(String(key))}
      className={cx(styles.select)}
      {...(isDisabled === undefined ? {} : { isDisabled })}
    >
      <Label className={cx(styles.label)}>{label}</Label>
      <AriaButton className={cx(styles.selectButton)}>
        <SelectValue />
        <Icon name="chevron-down" />
      </AriaButton>
      <AriaPopover className={cx(styles.popover)}>
        <AriaListBox className={cx(styles.listBox)}>
          {options.map((option) => (
            <ListBoxItem
              key={option.value}
              id={option.value}
              className={cx(styles.option)}
            >
              {option.label}
            </ListBoxItem>
          ))}
        </AriaListBox>
      </AriaPopover>
    </AriaSelect>
  );
}
