'use client';

import { HexBadge } from '#ui/index.js';

export function HexBadgeDemo() {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <HexBadge size="sm" icon="bolt">
        3
      </HexBadge>
      <HexBadge size="lg" tone="ice" icon="shield" label="护盾 12">
        12
      </HexBadge>
    </div>
  );
}
