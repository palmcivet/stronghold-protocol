'use client';

import { ProgressBar, Spinner } from '#ui/index.js';

export function ProgressDemo() {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <ProgressBar label="下载资源" value={42} />
      <ProgressBar label="击杀" value={3} max={10} valueText="3/10" />
      <ProgressBar label="等待同盟成员" />
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <Spinner label="正在连接" />
        <span>正在连接服务器</span>
      </div>
    </div>
  );
}
