'use client';

import { useState } from 'react';
import { ListBox } from '#ui/index.js';

export function ListBoxDemo() {
  const [selected, setSelected] = useState<readonly string[]>(['rookie']);
  const [strategy, setStrategy] = useState<string | null>('a');
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <ListBox
        multiple
        label="干员"
        selected={selected}
        onSelect={setSelected}
        items={[
          { id: 'rookie', label: '新人' },
          { id: 'guard', label: '近卫' },
          { id: 'sniper', label: '狙击', disabled: true },
        ]}
      />
      <ListBox
        variant="cards"
        label="策略"
        selected={strategy}
        onSelect={setStrategy}
        items={[
          { id: 'a', label: '守势' },
          { id: 'b', label: '突进' },
          { id: 'c', label: '空袭' },
        ]}
      />
    </div>
  );
}
