import type { Key, ReactNode } from 'react';
import {
  Button as AriaButton,
  Disclosure as AriaDisclosure,
  GridList as AriaGridList,
  ListBox as AriaListBox,
  Popover as AriaPopover,
  SearchField as AriaSearchField,
  Select as AriaSelect,
  Switch as AriaSwitch,
  Tabs as AriaTabs,
  DisclosurePanel,
  GridListItem,
  Heading,
  Input,
  Label,
  ListBoxItem,
  SelectValue,
  Tab,
  TabList,
  TabPanel,
} from 'react-aria-components';
import { cx } from '#infra/theme/class-name.js';
import { useFeedback } from './feedback.js';
import { Icon } from './icon.js';
import styles from './widget.module.css';

export interface TabItem {
  readonly id: string;
  readonly label: string;
  readonly content: ReactNode;
}

/** Pages of content behind a row of tabs. */
export function Tabs({
  label,
  items,
  selected,
  onSelect,
  orientation = 'horizontal',
}: {
  readonly label: string;
  readonly items: readonly TabItem[];
  readonly selected?: string;
  readonly onSelect?: (id: string) => void;
  readonly orientation?: 'horizontal' | 'vertical';
}) {
  const play = useFeedback();
  return (
    <AriaTabs
      orientation={orientation}
      className={cx(styles.tabs)}
      {...(selected === undefined ? {} : { selectedKey: selected })}
      onSelectionChange={(key) => {
        play('ui.tab');
        onSelect?.(String(key));
      }}
    >
      <TabList aria-label={label} className={cx(styles.tabList)}>
        {items.map((item) => (
          <Tab key={item.id} id={item.id} className={cx(styles.tab)}>
            {item.label}
          </Tab>
        ))}
      </TabList>
      {items.map((item) => (
        <TabPanel key={item.id} id={item.id} className={cx(styles.tabPanel)}>
          {item.content}
        </TabPanel>
      ))}
    </AriaTabs>
  );
}

export interface CollectionItem {
  readonly id: string;
  /** Text read out for the item. */
  readonly label: string;
  readonly content?: ReactNode;
  readonly disabled?: boolean;
}

/** A list to pick one (or several) from. */
export function ListBox({
  label,
  items,
  selected,
  onSelect,
  multiple = false,
}: {
  readonly label: string;
  readonly items: readonly CollectionItem[];
  readonly selected?: readonly string[];
  readonly onSelect?: (ids: readonly string[]) => void;
  readonly multiple?: boolean;
}) {
  return (
    <AriaListBox
      aria-label={label}
      selectionMode={multiple ? 'multiple' : 'single'}
      className={cx(styles.listBox)}
      disabledKeys={items
        .filter((item) => item.disabled)
        .map((item) => item.id)}
      {...(selected ? { selectedKeys: selected } : {})}
      onSelectionChange={(keys) =>
        onSelect?.(
          keys === 'all' ? items.map((item) => item.id) : [...keys].map(String),
        )
      }
    >
      {items.map((item) => (
        <ListBoxItem
          key={item.id}
          id={item.id}
          textValue={item.label}
          className={cx(styles.option)}
        >
          {item.content ?? item.label}
        </ListBoxItem>
      ))}
    </AriaListBox>
  );
}

/** A grid of cards navigable with the arrow keys; `onAction` fires on press. */
export function GridList({
  label,
  items,
  onAction,
  selected,
  onSelect,
  layout = 'grid',
}: {
  readonly label: string;
  readonly items: readonly CollectionItem[];
  readonly onAction?: (id: string) => void;
  readonly selected?: string | null;
  readonly onSelect?: (id: string) => void;
  /** `stack` lays the items out one per row, as a ladder. */
  readonly layout?: 'grid' | 'stack';
}) {
  return (
    <AriaGridList
      aria-label={label}
      layout={layout}
      className={cx(styles.gridList, layout === 'stack' && styles.stackList)}
      disabledKeys={items
        .filter((item) => item.disabled)
        .map((item) => item.id)}
      {...(onSelect
        ? {
            selectionMode: 'single' as const,
            selectedKeys: selected ? [selected] : [],
            onSelectionChange: (keys: 'all' | Set<Key>) => {
              const first = keys === 'all' ? undefined : [...keys][0];
              if (first !== undefined) {
                onSelect(String(first));
              }
            },
          }
        : {})}
      {...(onAction ? { onAction: (key: Key) => onAction(String(key)) } : {})}
    >
      {items.map((item) => (
        <GridListItem
          key={item.id}
          id={item.id}
          textValue={item.label}
          className={cx(styles.gridItem)}
        >
          {item.content ?? item.label}
        </GridListItem>
      ))}
    </AriaGridList>
  );
}

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

/** An on / off setting. */
export function Switch({
  children,
  isSelected,
  onChange,
  isDisabled,
}: {
  readonly children: ReactNode;
  readonly isSelected: boolean;
  readonly onChange: (on: boolean) => void;
  readonly isDisabled?: boolean;
}) {
  const play = useFeedback();
  return (
    <AriaSwitch
      isSelected={isSelected}
      onChange={(on) => {
        play('ui.tab');
        onChange(on);
      }}
      className={cx(styles.switch)}
      {...(isDisabled === undefined ? {} : { isDisabled })}
    >
      <span className={cx(styles.switchTrack)} aria-hidden="true">
        <span className={cx(styles.switchThumb)} />
      </span>
      {children}
    </AriaSwitch>
  );
}

/** A text box for filtering, with a clear button. */
export function SearchField({
  label,
  value,
  onChange,
  clearLabel,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly clearLabel: string;
}) {
  return (
    <AriaSearchField
      value={value}
      onChange={onChange}
      className={cx(styles.search)}
      aria-label={label}
    >
      <Icon name="search" />
      <Input className={cx(styles.searchInput)} placeholder={label} />
      {value ? (
        <AriaButton aria-label={clearLabel} className={cx(styles.searchClear)}>
          <Icon name="close" />
        </AriaButton>
      ) : null}
    </AriaSearchField>
  );
}

/** A section that folds open and closed under its title. */
export function Disclosure({
  title,
  children,
  defaultExpanded = false,
}: {
  readonly title: ReactNode;
  readonly children: ReactNode;
  readonly defaultExpanded?: boolean;
}) {
  return (
    <AriaDisclosure
      defaultExpanded={defaultExpanded}
      className={cx(styles.disclosure)}
    >
      <Heading level={3} className={cx(styles.disclosureHead)}>
        <AriaButton slot="trigger" className={cx(styles.disclosureButton)}>
          <Icon name="chevron-right" />
          {title}
        </AriaButton>
      </Heading>
      <DisclosurePanel className={cx(styles.disclosurePanel)}>
        {children}
      </DisclosurePanel>
    </AriaDisclosure>
  );
}
