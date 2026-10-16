'use client';

import { Thumb } from '#ui/index.js';

export function ThumbDemo() {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <Thumb name="阿米娅" color="var(--wsde-color-tier-4)" size="lg" />
      <Thumb name="近卫干员" color="var(--wsde-color-tier-2)" />
      <Thumb name="精英单位" color="var(--wsde-color-tier-5)" glow size="sm" />
    </div>
  );
}
