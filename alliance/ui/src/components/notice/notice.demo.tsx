'use client';

import { Notice } from '#ui/index.js';

export function NoticeDemo() {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Notice title="没有同盟" icon="users">
        创建一个同盟，或等待好友邀请。
      </Notice>
      <Notice
        variant="error"
        title="连接已断开"
        actions={<button type="button">重试</button>}
      >
        请检查网络后重新连接。
      </Notice>
    </div>
  );
}
