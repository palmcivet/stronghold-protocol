'use client';

import { useState } from 'react';
import { Select } from '#ui/index.js';

export function SelectDemo() {
  const [value, setValue] = useState('normal');
  return (
    <Select
      label="难度"
      value={value}
      onChange={setValue}
      options={[
        { value: 'funny', label: '简单' },
        { value: 'normal', label: '普通' },
        { value: 'hard', label: '困难' },
      ]}
    />
  );
}
