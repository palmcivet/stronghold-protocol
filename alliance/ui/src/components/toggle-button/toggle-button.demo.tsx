'use client';

import { useState } from 'react';
import { ToggleButton } from '#ui/index.js';

export function ToggleButtonDemo() {
  const [selected, setSelected] = useState(false);
  return (
    <ToggleButton variant="amber" isSelected={selected} onChange={setSelected}>
      {selected ? '已开启' : '未开启'}
    </ToggleButton>
  );
}
