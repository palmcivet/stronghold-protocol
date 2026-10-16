import type { ReactNode } from 'react';
import {
  Button as AriaButton,
  SearchField as AriaSearchField,
  Text as AriaText,
  TextField as AriaTextField,
  type TextFieldProps as AriaTextFieldProps,
  FieldError,
  Input,
  Label,
} from 'react-aria-components';
import { cx } from '#ui/base/class-name.js';
import type { ControlSize } from '#ui/base/tone.js';
import { Icon, type IconName } from '#ui/components/icon/icon.js';
import { Text } from '#ui/components/text/text.js';
import styles from './text-field.module.css';

export interface TextFieldProps
  extends Omit<AriaTextFieldProps, 'className' | 'type'> {
  readonly label: string;
  /** `search` is a box for filtering: it takes a search icon and a clear button. */
  readonly type?: 'text' | 'search';
  /** English label beside the label. */
  readonly micro?: string;
  /** Keeps the label for assistive technology and drops it from the screen. */
  readonly labelHidden?: boolean;
  /** Icon at the start of the box; a magnifier for `search`. */
  readonly icon?: IconName;
  /** A line of help under the box. */
  readonly hint?: string;
  readonly errorMessage?: string;
  readonly placeholder?: string;
  /** Accessible name of the clear button of a `search` box. */
  readonly clearLabel?: string;
  readonly size?: ControlSize;
}

/** A labelled text box whose corner marks close in on focus. */
export function TextField({
  label,
  type = 'text',
  micro,
  labelHidden = false,
  icon,
  hint,
  errorMessage,
  placeholder,
  clearLabel,
  size = 'md',
  value,
  ...rest
}: TextFieldProps) {
  const search = type === 'search';
  const content: ReactNode = (
    <>
      {labelHidden ? (
        <Label className={cx('wsde-visually-hidden')}>{label}</Label>
      ) : (
        <span className={cx(styles.caption)}>
          <Label className={cx(styles.label)}>{label}</Label>
          {micro ? (
            <span aria-hidden="true">
              <Text variant="micro">{micro}</Text>
            </span>
          ) : null}
        </span>
      )}
      <span className={cx(styles.box, 'wsde-brackets')}>
        {icon || search ? <Icon name={icon ?? 'search'} /> : null}
        <Input
          className={cx(styles.input)}
          {...(placeholder === undefined ? {} : { placeholder })}
        />
        {search && value && clearLabel ? (
          <AriaButton aria-label={clearLabel} className={cx(styles.clear)}>
            <Icon name="close" />
          </AriaButton>
        ) : null}
      </span>
      {hint ? (
        <AriaText slot="description" className={cx(styles.hint)}>
          {hint}
        </AriaText>
      ) : null}
      <FieldError className={cx(styles.error)}>{errorMessage}</FieldError>
    </>
  );
  const common = {
    ...rest,
    ...(value === undefined ? {} : { value }),
    className: cx(styles.field),
    'data-size': size,
    'data-tone': 'accent',
  };
  return search ? (
    <AriaSearchField {...common}>{content}</AriaSearchField>
  ) : (
    <AriaTextField {...common}>{content}</AriaTextField>
  );
}
