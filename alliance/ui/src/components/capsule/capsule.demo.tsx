'use client';

import { Capsule } from '#ui/index.js';

export function CapsuleDemo() {
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      <Capsule label="准备" detail="0:45" />
      <Capsule label="作战" tone="orange" detail="12 / 20" progress={0.6} />
      <Capsule label="首领" tone="danger" progress={0.2} />
    </div>
  );
}
