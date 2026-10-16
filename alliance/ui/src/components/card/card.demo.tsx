'use client';

import { Card } from '#ui/index.js';

export function CardDemo() {
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <Card title="突进" tone="orange">
        近战为主，前压快。
      </Card>
      <Card title="守势" tone="gold" selected>
        已选中的卡片。
      </Card>
      <Card title="空袭" muted>
        暂不可用的卡片。
      </Card>
      <Card layout="row">
        <span>放大界面</span>
        <kbd>Ctrl +</kbd>
      </Card>
    </div>
  );
}
