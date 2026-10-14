import {
  TextField as AriaTextField,
  type TextFieldProps as AriaTextFieldProps,
  FieldError,
  Input,
  Label,
} from 'react-aria-components';
import { cx } from '#infra/theme/class-name.js';
import styles from './primitive.module.css';

export interface TextFieldProps extends Omit<AriaTextFieldProps, 'className'> {
  readonly label: string;
  readonly errorMessage?: string;
}

export function TextField({ label, errorMessage, ...rest }: TextFieldProps) {
  return (
    <AriaTextField {...rest} className={cx(styles.field)}>
      <Label className={cx(styles.label)}>{label}</Label>
      <Input className={cx(styles.input)} />
      <FieldError className={cx(styles.error)}>{errorMessage}</FieldError>
    </AriaTextField>
  );
}
