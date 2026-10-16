'use client';

import { Button, Tooltip } from '#ui/index.js';

export function TooltipDemo() {
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
      <Tooltip tip="复制到剪贴板">
        <Button square aria-label="复制" icon="copy" />
      </Tooltip>
      <Tooltip tip="每回合开始时刷新" label="回合信息">
        <span>第 3 回合</span>
      </Tooltip>
    </div>
  );
}
