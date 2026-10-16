import type { ReactNode } from 'react';
import {
  Tabs as AriaTabs,
  Tab,
  TabList,
  TabPanel,
} from 'react-aria-components';
import { cx } from '#ui/base/class-name.js';
import { useFeedback } from '#ui/components/feedback/feedback.js';
import styles from './tabs.module.css';

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
      keyboardActivation="manual"
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
