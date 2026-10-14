import {
  Button as AriaButton,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
} from 'react-aria-components';
import { cx } from '#infra/theme/class-name.js';
import styles from './primitive.module.css';

export interface ActionMenuItem {
  readonly id: string;
  readonly label: string;
}

export interface ActionMenuProps {
  /** Text of the button that opens the menu. */
  readonly label: string;
  readonly items: readonly ActionMenuItem[];
  readonly onAction: (id: string) => void;
  readonly isDisabled?: boolean;
}

/** A button that opens a list of actions. */
export function ActionMenu({
  label,
  items,
  onAction,
  isDisabled = false,
}: ActionMenuProps) {
  return (
    <MenuTrigger>
      <AriaButton isDisabled={isDisabled} className={cx(styles.button)}>
        {label}
      </AriaButton>
      <Popover className={cx(styles.popover)}>
        <Menu
          aria-label={label}
          items={items}
          onAction={(key) => onAction(String(key))}
          className={cx(styles.menu)}
        >
          {(item) => (
            <MenuItem id={item.id} className={cx(styles.menuItem)}>
              {item.label}
            </MenuItem>
          )}
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
