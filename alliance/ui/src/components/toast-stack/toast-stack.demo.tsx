'use client';

import { useState } from 'react';
import { Button, type ToastItem, ToastStack } from '#ui/index.js';

export function ToastStackDemo() {
  const [count, setCount] = useState(0);
  const toasts: ToastItem[] =
    count === 0
      ? []
      : [{ id: 'saved', text: '设置已保存', tone: 'accent', count }];
  return (
    <div style={{ display: 'grid', gap: 12, justifyItems: 'start' }}>
      <Button onPress={() => setCount((value) => value + 1)}>发出提示</Button>
      <ToastStack label="提示" toasts={toasts} />
    </div>
  );
}
