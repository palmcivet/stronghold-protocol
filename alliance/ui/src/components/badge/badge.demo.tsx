'use client';

import { Badge, Hotkey, Text } from '#ui/index.js';

export function BadgeDemo() {
  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap',
        alignItems: 'center',
      }}
    >
      <Badge>待定</Badge>
      <Badge tone="accent">就绪</Badge>
      <Badge tone="danger">离线</Badge>
      <Badge shape="pill" icon="users">
        全部
      </Badge>
      <Badge shape="pill" tone="accent" icon="star">
        收藏
      </Badge>
      <Badge shape="pill" tone="gold" glow>
        盟约 <Text variant="number">6</Text>
      </Badge>
      <Badge shape="square" color="var(--wsde-color-tier-4)" label="四阶">
        4
      </Badge>
      <Badge color="var(--wsde-color-difficulty-hard)">困难</Badge>
      <Hotkey code="KeyQ" />
    </div>
  );
}
