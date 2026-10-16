'use client';

import { useState } from 'react';
import { Tabs } from '#ui/index.js';

export function TabsDemo() {
  const [selected, setSelected] = useState('lobby');
  return (
    <Tabs
      label="房间设置"
      selected={selected}
      onSelect={setSelected}
      items={[
        { id: 'lobby', label: '大厅', content: '同盟大厅的设置。' },
        { id: 'rules', label: '规则', content: '难度与座位的规则。' },
        { id: 'keys', label: '按键', content: '按键映射。' },
      ]}
    />
  );
}
