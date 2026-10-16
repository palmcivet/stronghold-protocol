'use client';

import { Spinner } from '#ui/index.js';

export function SpinnerDemo() {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <Spinner label="正在连接" />
      <span>正在连接服务器</span>
    </div>
  );
}
