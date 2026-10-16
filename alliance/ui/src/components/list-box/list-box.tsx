import type { Key, ReactNode } from 'react';
import { ListBox as AriaListBox, ListBoxItem } from 'react-aria-components';
import { cx } from '#ui/base/class-name.js';
import styles from './list-box.module.css';

export interface CollectionItem {
  readonly id: string;
  /** Text read out for the item. */
  readonly label: string;
  readonly content?: ReactNode;
  readonly disabled?: boolean;
}

interface ListBoxBase {
  readonly label: string;
  readonly items: readonly CollectionItem[];
  /** `list` is plain rows; `cards` a grid of framed items; `ladder` framed items one per row. */
  readonly variant?: 'list' | 'cards' | 'ladder';
  /** Fires when an item is pressed, selected or not. */
  readonly onAction?: (id: string) => void;
}

export type ListBoxProps = ListBoxBase &
  (
    | {
        readonly multiple?: false;
        readonly selected?: string | null;
        readonly onSelect?: (id: string) => void;
      }
    | {
        readonly multiple: true;
        readonly selected?: readonly string[];
        readonly onSelect?: (ids: readonly string[]) => void;
      }
  );

/** A list to pick one (or several) from, with the arrow keys. */
export function ListBox(props: ListBoxProps) {
  const { label, items, variant = 'list', onAction } = props;
  const selection = (() => {
    if (props.multiple) {
      const { onSelect, selected } = props;
      return {
        selectionMode: 'multiple' as const,
        ...(selected ? { selectedKeys: selected } : {}),
        onSelectionChange: (keys: 'all' | Set<Key>) =>
          onSelect?.(
            keys === 'all'
              ? items.map((item) => item.id)
              : [...keys].map(String),
          ),
      };
    }
    const { onSelect, selected } = props;
    if (!onSelect && selected === undefined) {
      return { selectionMode: 'none' as const };
    }
    return {
      selectionMode: 'single' as const,
      selectedKeys: selected ? [selected] : [],
      onSelectionChange: (keys: 'all' | Set<Key>) => {
        const first = keys === 'all' ? undefined : [...keys][0];
        if (first !== undefined) {
          onSelect?.(String(first));
        }
      },
    };
  })();
  return (
    <AriaListBox
      aria-label={label}
      layout={variant === 'cards' ? 'grid' : 'stack'}
      className={cx(styles.listBox)}
      data-variant={variant}
      disabledKeys={items
        .filter((item) => item.disabled)
        .map((item) => item.id)}
      {...selection}
      {...(onAction ? { onAction: (key: Key) => onAction(String(key)) } : {})}
    >
      {items.map((item) => (
        <ListBoxItem
          key={item.id}
          id={item.id}
          textValue={item.label}
          aria-label={item.label}
          className={cx(styles.option)}
        >
          {item.content ?? item.label}
        </ListBoxItem>
      ))}
    </AriaListBox>
  );
}
