'use client';

import { Text } from '#ui/index.js';

export function TextDemo() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Text variant="micro">MODE</Text>
      <Text variant="micro" tone="gold">
        PRICE
      </Text>
      <Text kind="muted">次要说明</Text>
      <span>
        <Text variant="number">1280</Text> 资金，
        <Text variant="number" kind="good">
          +12
        </Text>{' '}
        <Text variant="number" kind="bad">
          -3
        </Text>
      </span>
    </div>
  );
}
